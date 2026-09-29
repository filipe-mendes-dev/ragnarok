# Initial golden page review

The selected expectations in [golden-pages.json](golden-pages.json) come from
visually reviewing four pages across the three complete benchmark PDFs. They
record reading-order anchors, visible roles, a few reconstructed phrases, and
the two tables on the paper's fifth page. They do not transcribe every word or
define a production document model. Compare the parser outputs under the
ignored `runs/<pdf-name>/` directories with the rendered source pages.

PDF pages use one-based numbering. The Portuguese regulation's PDF page 4
displays printed page number 3; the distinction matters for citations.

## Paper, PDF page 2: two columns and continuing paragraphs

Expected reading:

1. Treat the printed `2` as a page number, separate from body text.
2. Read the left column through its end, then continue the same paragraph at
   the top of the right column. The first paragraph on this page also begins
   on PDF page 1, so its source spans both pages.
3. Keep `II. RELATED WORK` as a distinct heading after the introduction text.
   Then read the right-column paragraphs below it.
4. Join lines within paragraphs without joining different columns. Preserve
   the hyphen in `semi-structured` when joining its wrapped line.

Observed differences:

- PyPDF layout text places left and right column lines on the same rows, with
  long spaces between them. It exposes no paragraph or heading roles.
- PyMuPDF `sort=False` largely follows the columns, but retains line breaks.
  `sort=True` interleaves columns and even joins the heading to nearby text.
  Its JSON supplies positions and fonts, without semantic roles.
- Docling reconstructs paragraphs and labels the page number and heading.
  It emits `RELATEDWORK` and `semistructured`, losing two meaningful spaces or
  hyphens. Its JSON gives a paragraph provenance on pages 1 and 2.

## Paper, PDF page 5: headings, captions, tables, and a footnote

Expected reading:

1. Treat the printed `5` as a page number. Continue the paragraph from PDF
   page 4 at the top of the left column.
2. Keep `IV. EXPERIMENTS` and `A. Experimental Data` as distinct headings.
   The paragraph beginning under the latter continues from the bottom of the
   left column to the top of the right column.
3. Keep each table caption separate from the table. Table I has columns
   `Language`, `Types`, and `Tokens`, with four language rows. Table II has
   five columns and four language rows. Row-to-column relationships matter;
   a single flattened line is insufficient.
4. Keep `B. N-gram Language Models` as a heading after Table I. Keep the
   numbered URL note as a footnote, separate from the main paragraph.

Observed differences:

- PyPDF layout text and PyMuPDF `sort=True` mix table rows with left-column
  prose. They do not identify captions or table cells.
- PyMuPDF `sort=False` provides readable text and coordinates, but no table
  relationships or semantic roles.
- Docling labels the headings, captions, footnote, and table regions. With
  table-structure recognition disabled in this benchmark, each detected
  table is a one-cell placeholder; row text appears separately. This result
  cannot establish whether Docling can recover the expected table grids when
  table recognition is enabled.

## Constitution, PDF page 5: legal hierarchy and repeated footer

Expected reading:

1. Keep `The Republic (ss 1-2)` as a heading. Keep numbered sections 1 and 2
   distinct from their following paragraphs.
2. Keep `CHAPTER II`, its full chapter title, and `3. Fundamental rights and
   freedoms of the individual` as three separate hierarchy elements.
3. Keep numbered section headings 4 and 5 distinct from their content.
   Lettered clauses `(a)`, `(b)`, and so on are list items within the relevant
   section; their labels and order matter.
4. Identify `Copyright Government of Botswana` as a repeated page footer,
   separate from the body. It should not become a section heading.

Observed differences:

- PyPDF preserves the overall single-column order and numbering, but keeps
  hard line breaks and layout spaces. It has no structural roles.
- PyMuPDF `sort=False` places the copyright footer before the main text;
  `sort=True` moves it to the bottom. Neither form identifies legal hierarchy.
- Docling identifies several headings and lettered clauses, but merges the
  chapter title with section 3, labels numbered section headings as list
  items, and labels this page's copyright footer as a section heading.

## Portuguese regulation, PDF page 4: articles and nested lists

Expected reading:

1. Read `CAPÍTULO I – SOBRE O JOGO`, then `ARTIGO 1`, its four numbered
   clauses, `ARTIGO 2`, and its numbered clauses in order.
2. Keep the lettered items `a` through `g` under article 2, clause 1. Clause 3
   starts another lettered sequence.
3. Join wrapped lines within clauses while preserving Portuguese accents.
4. Treat the printed `3`, logo, and organization line as page furniture,
   separate from the article text.

Observed differences:

- PyPDF largely keeps the reading order, but introduces very wide spaces inside
  justified lines. It does not identify article or list nesting.
- PyMuPDF `sort=False` preserves the accented text and clause order, but places
  the footer and printed page number before the chapter heading. `sort=True`
  moves the footer to the bottom and retains the list's visible indentation.
- Docling identifies article headings and list items, but its Markdown and
  structured JSON corrupt many accented characters on this file: `hóquei`
  becomes `h-quei`, and `é` becomes `Ž`. Its layout labels cannot compensate
  for incorrect text.

## Decisions to review together

- Should page numbers and repeated footers remain as separate source elements
  for audit, even though they should not appear in body text?
- How should a paragraph that spans pages or columns retain its provenance?
- For tables, is preserving the caption and cell grid necessary for the kinds
  of questions RAGnarok should answer? The paper suggests yes, but the current
  benchmark has table recognition disabled.
