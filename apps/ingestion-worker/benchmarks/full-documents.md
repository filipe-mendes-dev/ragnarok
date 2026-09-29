# Complete PDF comparison

This report records the initial run on two complete PDFs in `corpus/full/` and
three parsers. A third, Portuguese regulation was added later and is included
in the current benchmark script and golden page review. Its saved outputs have
not been added to this timing table.
Versions: PyPDF 6.19.0, PyMuPDF 1.28.2, Docling 2.130.0. OCR and Docling
table-structure recognition were disabled. The Docling models were already
downloaded locally. Raw outputs are in the ignored `runs/<pdf-name>/`
directories.

| PDF | Pages | PyPDF | PyMuPDF | Docling |
| --- | ---: | ---: | ---: | ---: |
| `1504.02490.pdf` | 10 | 0.22 s | 0.54 s | 6.56 s |
| `botswana-constitution.pdf` | 59 | 6.10 s | 2.73 s | 31.62 s |

These are single local observations, not throughput estimates. Each timer
includes document processing and in-memory text/structure export; it excludes
writing the output files. Imports happen before timing. Docling's converter
and pipeline are initialized once before processing either PDF; setup took
2.33 s separately. Model download time is excluded.

## What the complete documents reveal

- The paper confirms the two-column problem over multiple pages. PyPDF layout
  text and PyMuPDF position-sorted text interleave columns. PyMuPDF's original
  content order happens to read the columns correctly here but preserves hard
  line breaks. Docling largely reconstructs paragraphs and section headings,
  yet merges `RELATED WORK` into `RELATEDWORK` on PDF page 2.
- The paper contains tables. Docling detects six table regions even with
  table-structure recognition disabled, but its Markdown rows are collapsed
  into broad cells. This run cannot establish table extraction quality.
- The constitution exposes repeated footer handling. The copyright line
  appears on all 59 PDF pages and in both PyPDF and PyMuPDF text outputs.
  Docling marks 51 such occurrences as page footers in its structured export,
  but the remaining eight appear in Markdown as headings. Footer removal
  therefore cannot rely blindly on one predicted label.
- The constitution's Docling Markdown provides many section and list labels,
  but sometimes merges distinct hierarchy levels, including chapter and part
  labels in the opening arrangement of sections. Its structured JSON preserves
  page and provenance information that plain Markdown does not.
- PyMuPDF's detailed JSON is large: about 8.4 MB for the 277 KB paper PDF and
  12 MB for the 252 KB constitution PDF. A production representation should
  retain only the layout fields needed downstream, rather than persist the
  complete parser export by default.

The current ingestion worker has a 30-second child-process limit that also
covers storage download. Docling's 31.62-second constitution measurement already
exceeds that limit before storage work. A direct parser replacement would need
different execution limits or routing; this benchmark does not justify one.
The expected elements for four selected pages are in `golden-pages.json`; the
manual review is in `golden-pages.md`. The evaluator writes
`evaluation-results/report.txt` when run. That review led to PyMuPDF
`sort=False` as the current production extractor. Keep the full PDFs for timing
and broad failure inspection; the selected-page checks are not a whole-document
quality score.
