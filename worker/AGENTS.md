# Python worker instructions

- Python is a learning language for the user. Work in small steps and explain each new construct, its runtime behavior, and its TypeScript equivalent when useful.

## Required Python code walkthrough

- Treat every Python implementation change as a teaching task. The user understands the architecture better than the Python implementation; do not assume familiarity with Python syntax.
- For every Python file created or modified, including tests and fixtures, explain the actual new or changed code in the conversation. File-purpose summaries, tables of responsibilities, docstrings, comments, and links to a README are supplementary, not substitutes for this walkthrough.
- Show short excerpts of the actual code and explain them statement by statement or in small coherent blocks. For a new file, cover the entire file. For an existing file, cover the changed code and the surrounding context needed to understand it.
- Explain imports, function signatures, parameter and return annotations, decorators, classes, and unfamiliar syntax as they appear. Distinguish Python language behavior from library behavior. Use TypeScript comparisons when they clarify a concept, but explain Python on its own terms too.
- Trace execution with a concrete input: identify what calls the function, the values passed in, what each block does, and what is returned. Explain when execution pauses, resumes, exits, or raises an exception where relevant.
- For database and queue code, explain the SQL statements and parameters, transaction and connection lifetimes, locks, acknowledgements, and what happens on failure. For tests, explain fixture injection, setup, the action under test, assertions, and cleanup.
- Explain why each implementation choice is needed now and the trade-offs accepted. Do not merely restate what the function name suggests.
- Keep each implementation step small enough to explain fully before adding another layer. Do not create a large batch of files and replace the walkthrough with a short final summary.
- Previously explained syntax may be recapped briefly, but do not skip new uses with different behavior. These walkthrough requirements take precedence over default brevity preferences unless the user explicitly asks to skip the explanation for that step.

## Implementation conventions

- Before adding a library, explain the concrete problem it solves and why the standard library or an existing dependency is insufficient.
- Use uv for dependencies and execution. The user runs dependency, environment, and infrastructure setup commands as part of the learning flow; inspect and verify the results afterward.
- Keep `pyproject.toml` as the dependency declaration and let uv generate `uv.lock`. Do not edit the lockfile manually.
- Use typed named functions and small data objects. Do not use `Any`. Explain that annotations do not enforce runtime validation.
- Use dataclasses for internal values. Consider Pydantic for untrusted message inputs when the consumer is implemented; validate strict types and reject unexpected fields explicitly.
- Keep the future RabbitMQ entry point thin. Python ingestion services own workflows and transactions; repositories own parameterized SQL.
- Drizzle remains the sole database migration owner. Do not introduce Python migrations or schema creation at worker startup.
- Keep tests under `tests/unit` and `tests/integration`, mirroring `src/ragnarok_ingestion`. Database integration tests must use disposable infrastructure and committed migrations.
- Use pytest as the intended runner once installed. Existing unittest cases can run unchanged under pytest; prefer named test functions, plain assertions, and parametrization for new pytest tests. Explain fixtures before introducing shared setup.
