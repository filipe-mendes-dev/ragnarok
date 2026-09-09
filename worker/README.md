# Python ingestion

The worker package splits extracted text with LangChain and now includes read-only
PostgreSQL repositories for text sources and chunk configurations. It does not
consume RabbitMQ messages, read PDFs, persist chunks, or generate embeddings yet.

## Setup

Use uv to manage the Python project. On macOS with Homebrew, install uv once:

```bash
brew install uv
```

The initial uv environment and lockfile have been generated. The pytest runner is
the next development dependency. From `worker/`, run `uv add --dev pytest` once
and review the resulting `pyproject.toml` and `uv.lock` changes. Until then, the
existing tests still run with `uv run python -m unittest discover -s
tests/unit/ragnarok_ingestion -v` on one line.

For normal use, run from the repository root:

```bash
cd worker
uv sync
uv run python -m pytest -v
uv run python examples/chunk_text.py
```

`uv sync` reads `pyproject.toml`, resolves dependencies into `uv.lock`, and installs
them into `.venv`. It also installs this package in editable mode, so source edits
take effect without reinstalling. `.python-version` selects Python 3.14. uv can
download an appropriate Python interpreter if it cannot find one locally.

`uv run` executes a command in that environment. There is no activation step and
no need to use `.venv/bin/python` directly. `python -m pytest` runs the test runner.
`testpaths` in `pyproject.toml` tells it to search `tests/`; `-v` prints individual
test names. The existing unittest classes are compatible with pytest. New tests
can use plain functions, assertions, and parametrization rather than requiring classes.

This project already has `pyproject.toml`, so do not run `uv init` again. uv supports
the existing setuptools build backend; adopting uv does not require replacing it.
Setuptools tells the installer how to find and install our package under `src`.

Commit the generated `uv.lock` after reviewing it, alongside `pyproject.toml` and
`.python-version`. Keep `.venv` untracked. Use `uv sync --locked` in CI to reject
an outdated lockfile. The current LangChain environment and lock have been inspected;
pytest installation remains pending.

To add a dependency later, use `uv add <package>` from `worker/`. That updates the
declaration, lockfile, and environment together. Use `--dev` for tools such as pytest
that the production worker does not need.

## Files and Python concepts

- `pyproject.toml` declares the project and dependencies, similar to `package.json`.
- `.python-version` selects the default interpreter version for uv.
- `src/ragnarok_ingestion/__init__.py` identifies the Python package. It does not start a process.
- `src/ragnarok_ingestion/chunking.py` defines the splitting function and its data objects.
- `examples/chunk_text.py` is a script that calls the function and prints results.
- `tests/unit/ragnarok_ingestion/test_chunking.py` checks behavior using the real splitter.
- `AGENTS.md` records the Python learning and implementation conventions.

`def` declares a function; indentation defines its body. An annotation such as
`text: str` describes the expected type but does not validate it at runtime.
`raise ValueError(...)` rejects an invalid value, similar to throwing an error.

`@dataclass(frozen=True)` creates a data object with generated initialization and
equality methods, and prevents normal field reassignment. `__post_init__` runs
after initialization, which is where settings validate their values. Python's
`bool` is a subclass of `int`, so the exact `type(...) is int` check intentionally
rejects `True` as a chunk size.

The list comprehension in `chunk_text` builds one `TextChunk` for each split.
`enumerate` supplies both its index and text, similar to the index argument in a
TypeScript `map` callback. The example's `if __name__ == "__main__"` block runs the
demo only when the file is executed directly, not when another module imports it.

## Where Pydantic belongs

Pydantic is a candidate for the future RabbitMQ input boundary, playing a role
similar to Zod in the web application. It validates external JSON and creates a
typed object. The planned consumer must reject unsupported versions, invalid IDs,
invalid revisions, missing ownership, and unexpected fields. Use explicit strict
validation rather than silently accepting coercions such as a numeric string for
a revision. Both languages must agree on the same JSON names and constraints.

Pydantic is not an ORM, a migration system, or an authorization check. Keep internal
chunk values as dataclasses. No direct Pydantic dependency or message validator
has been added yet; when our own code imports it, declare it directly even if
LangChain already brings it in transitively.

## Chunking behavior

`chunk_text` returns `TextChunk` values with a zero-based ordinal and text.
Frozen dataclasses describe settings and output without mutable shared state.
Python annotations describe types; the function also rejects invalid source types,
and settings validate integer sizes at runtime.

The initial defaults are 1,000 characters and a target overlap of 150 characters.
They are trial settings, not measured retrieval optima. Size uses Python's `len`,
which counts Unicode code points, not UTF-8 bytes, JavaScript UTF-16 units, or model
tokens. Token limits will be addressed when an embedding model is selected.

The splitter tries paragraph breaks, line breaks, spaces, then individual characters.
It may split a sentence. Overlap is a target and can be smaller at paragraph boundaries.
Line endings are normalized to LF and surrounding whitespace is stripped. Blank
sources raise `ValueError`; an ingestion service will later map that to a safe failure.
Meaningful repeated passages are preserved. Retained separators count toward the
size during splitting, even when they are later stripped. At very small limits,
a word that appears to fit can therefore split further. Preservation tests must
not assume all repeated words produce identical chunk boundaries.

This module expects bounded source text from the future loader. Download, page,
extraction, and execution limits belong to the later ingestion step. It carries no
document IDs, revision, PDF page metadata, or source offsets yet. Those will be
attached by the ingestion service when source loading and persistence are designed.
Persist `CHUNKING_METHOD` and the settings with the resulting chunk set so we can
identify how it was produced. Change the method version when normalization or
splitting behavior changes.

Tests use the real LangChain splitter. The example prints the same sample with two
size settings so we can review boundaries before building persistence.

## Why keep the example

The example is a manual inspection tool, not a test fixture or production entry
point. Tests do not import it. Keep it while evaluating chunk settings: it shows
that a small limit can produce a heading-only chunk such as `Processing`. Passing
unit tests proves the tested splitting rules, not retrieval quality. Later we can
replace this demo with representative evaluation documents.

## PostgreSQL reads

From `worker/`, install the new dependencies as part of the learning flow:

```bash
uv add "psycopg[binary]"
uv add --dev "testcontainers[postgres]"
uv run python -m pytest tests/unit -v
uv run python -m pytest tests/integration -v
```

Psycopg is the database driver. The binary extra supplies the compiled driver
without requiring local PostgreSQL build tools. Testcontainers starts disposable
PostgreSQL for tests. Docker must be running, and the repository's npm dependencies
must be installed. Until these Python dependencies are installed, run only `tests/unit`.

New files:

- `database.py` opens a connection with connection, statement, and lock timeouts.
- `document_repository.py` reads text by document ID, owner ID, and revision in the same query. PDFs and unmatched rows return `None`.
- `chunk_config_repository.py` reads a configuration by ID. It does not create or update settings.
- `tests/integration/conftest.py` provides a disposable database and per-test rollback.
- `tests/integration/ragnarok_ingestion/` checks reads, ownership, stale revisions, missing records, and PDF exclusion.

A connection is a session with PostgreSQL. A cursor executes a query and reads its
results. The `with` statement closes the cursor when execution leaves its block,
including after an exception. The caller owns the connection and must close it.

SQL `%s` placeholders receive a separate tuple of values. They are not Python
string interpolation. In `(config_id,)`, the trailing comma creates a one-element
tuple. This keeps user input out of the SQL syntax. Psycopg adapts `UUID` values to
PostgreSQL UUIDs automatically.

`class_row(TextDocumentSource)` uses result column names to construct the dataclass.
It is a row mapper, not Pydantic validation. The query and database constraints
supply the expected shape; integration tests catch schema mismatches. `fetchone()`
returns a matching object or `None`. The repositories do not claim work or decide
whether a status is eligible for ingestion.

`autocommit=True` means these reads do not leave an implicit transaction open.
Future service writes will use explicit `connection.transaction()` blocks to
commit chunk replacement and completion together. Extraction must happen outside
that transaction.

A pytest fixture supplies setup to tests that name it as an argument. `yield`
hands the resource to the test, then runs the remaining cleanup afterward.
The session fixture shares only expensive container setup. Each test gets a
separate connection and a transaction that always rolls back its seed rows.
This rollback fixture is intended for these read-only repository tests; future
service commit tests need independent connections and explicit cleanup.

The container fixture runs the existing `npm run db:migrate` command from the
repository root. It overrides `DATABASE_URL` with the disposable container URL
before running the command. It never loads a development URL for test queries,
reimplements migration ordering, or creates a Python migration history.
