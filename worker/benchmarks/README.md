# PDF parser comparison

This experiment compares extraction output before normalization, chunking, or
embedding. It does not call the ingestion worker or change stored documents.

## Corpus

Run the comparison on the complete PDFs under `corpus/full/`:

| File | Pages | Source | Why it is useful |
| --- | ---: | --- | --- |
| `1504.02490.pdf` | 10 | [arXiv](https://arxiv.org/pdf/1504.02490) | Two-column article, headings, references, and content spanning pages. |
| `botswana-constitution.pdf` | 59 | [Parliament of Botswana](https://www.parliament.gov.bw/images/constitution.pdf) | Long regulation with chapters, numbered sections, repeated page furniture, and cross-page continuity. |
| `2025-HP-Regras_Jogo_Regulamento_Tecnico.pdf` | 83 | [Federação de Patinagem de Portugal](https://fpp.pt/wp-content/uploads/2025-HP-Regras_Jogo_Regulamento_Tecnico.pdf) | Portuguese regulation with numbered articles, nested lists, and repeated page furniture. |

Download the full source PDFs before running the benchmark. They stay local
because the sources, rather than this repository, distribute those documents:

```bash
mkdir -p benchmarks/corpus/full
curl -L --fail https://arxiv.org/pdf/1504.02490 \
  -o benchmarks/corpus/full/1504.02490.pdf
curl -L --fail https://www.parliament.gov.bw/images/constitution.pdf \
  -o benchmarks/corpus/full/botswana-constitution.pdf
curl -L --fail https://fpp.pt/wp-content/uploads/2025-HP-Regras_Jogo_Regulamento_Tecnico.pdf \
  -o benchmarks/corpus/full/2025-HP-Regras_Jogo_Regulamento_Tecnico.pdf
```

## Run

From `worker/`:

```bash
uv run --group benchmark python -m benchmarks.compare_pdf_parsers
```

`uv run` installs the benchmark group when needed. The explicit two-step
alternative is `uv sync --group benchmark`, followed by
`uv run --no-sync python -m benchmarks.compare_pdf_parsers` for repeated runs.
Run either form from `worker/`, where `benchmarks` is importable as a Python
namespace package.

The script's `PDFS` list fixes the three complete input PDFs. Edit that list to
change the local corpus. Successful conversions write under `runs/<pdf-name>/`.

The `benchmark` group keeps PyPDF and Docling out of the production worker's
declared dependencies; PyMuPDF is the production extractor. Docling may download
its public layout model on the first run; model files are cached separately from
uv packages. An unauthenticated Hugging Face Hub warning is informational unless
a download fails or is rate limited. OCR and table-structure recognition are
explicitly disabled for this baseline. A later table benchmark should enable
table recognition and record its separate model cost. Each PDF gets:

- `pypdf.txt` and `pypdf.json`: PyPDF layout text and page-numbered result.
- `pymupdf.txt`, `pymupdf-sorted.txt`, and `pymupdf.json`: original-order
  and position-sorted text, plus blocks, lines, spans, fonts, boxes, and words.
- `docling.txt` and `docling.json`: Markdown and the structured document export.

`raw_structure` in the script holds each adapter's own export. It is not a
normalized RAGnarok document model.

The script processes every page and prints one conversion time per parser and
document. The timer includes in-memory text and structure export, but excludes
file writing. Docling's pipeline is initialized once before the document loop;
its setup time is printed separately. Python imports happen before either
timer. For Docling, set `HF_HOME` to the location of its downloaded models if
they are not in the default cache. Unexpected errors stop the script with a
traceback. Review the outputs page by page, recording specific successes and
failures before any further parsing changes.

See [golden-pages.json](golden-pages.json) for selective, manually checked
expectations on four pages and [golden-pages.md](golden-pages.md) for the
side-by-side review. These expectations are neither complete page transcripts
nor a normalized document schema. Review the initial gold annotations against
the source PDFs before treating them as a pass gate. The benchmark still
processes every page of all three PDFs. [full-documents.md](full-documents.md)
records observations and timings from the initial two-document run.

To review a case, open the named PDF page beside each parser's saved text and
JSON. Check the `expected_body_order` anchors in sequence, then inspect the
visible roles, reconstructed phrases, and table cells. Record which parser
preserves each item, which item needs later normalization, and which text is
actually missing or corrupted. Inspect both PyMuPDF text orders. No automatic
pass threshold exists; four selected pages cannot establish whole-document
accuracy.

After generating `runs/`, evaluate the saved outputs without rerunning the
parsers:

```bash
uv run --no-sync python -m benchmarks.evaluate_pdf_parsers
```

The evaluator prints the report and saves the same text at
`evaluation-results/report.txt`. The folder is local, ignored by Git, and the
file is replaced on each run.

For each golden page and parser, the evaluator reports three simple checks:

- **Anchors:** how many selected body-text snippets appear on that PDF page.
- **Order:** how many adjacent *found* anchors appear in the expected sequence.
  Missing anchors are reported separately; `n/a` means fewer than two were found.
- **Phrases:** whether a selected phrase remains contiguous after whitespace
  normalization. This can reveal broken line joins or corrupted characters;
  it does not validate paragraph boundaries.

Comparison folds case and whitespace and applies Unicode compatibility
normalization. It still distinguishes accented letters and punctuation, so
Docling's corrupted Portuguese characters remain visible. Each anchor uses its
first occurrence on the page. PyPDF and PyMuPDF use their saved page-delimited
text; Docling uses the page provenance of text items in `docling.json`, because
its saved Markdown has no page markers. The Docling check therefore measures
the text and item order in that JSON export, not Markdown formatting. A Docling
text item can span two PDF pages, so its page-local result may include words
from the adjacent page.

Read the three checks together: `4/8` anchors and `3/3` order means only four
anchors were found, and those four were in sequence. It is not a 100% page
score.

These checks deliberately do not score complete text accuracy, heading or list
roles, page furniture, or table row-to-column relationships. Review those
against `expected_elements`, `tables`, and `review_notes` in the gold file and
the source PDFs. The current Docling run has table recognition disabled, so a
table-structure score would be misleading. The gold annotations are an initial
manual sample, not a verified pass gate or a benchmark of all document pages.

The generated `runs/` directory stays local and is ignored by Git.
