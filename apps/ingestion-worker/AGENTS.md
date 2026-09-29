# Python worker instructions

## Explanations

- Explain new implementation decisions and non-obvious logic briefly, including why each new dependency, abstraction, or mechanism is needed.
- Assume familiarity with previously explained Python syntax. Do not repeat line-by-line walkthroughs of imports, annotations, decorators, fixtures, or unchanged code.
- Use a short code excerpt or concrete execution example only when it clarifies new behavior.
- For database and queue changes, explain any changed transaction, locking, retry, or acknowledgement behavior and its reason.
- These rules also apply to Python files outside worker. Follow the root communication and efficient-work rules.

## Implementation conventions

- Before adding a library, explain the concrete problem it solves and why the standard library or an existing dependency is insufficient.
- Use uv for dependencies and execution. Run dependency, environment, and infrastructure commands when authorized; explain new dependencies briefly and verify their installation.
- Keep `pyproject.toml` as the dependency declaration and let uv generate `uv.lock`. Do not edit the lockfile manually.
- Use typed named functions and small data objects. Do not use `Any`. Keep untrusted inputs runtime-validated.
- Use dataclasses for internal values. Consider Pydantic for untrusted message inputs when the consumer is implemented; validate strict types and reject unexpected fields explicitly.
- Keep the future RabbitMQ entry point thin. Python ingestion services own workflows and transactions; repositories own parameterized SQL.
- Drizzle remains the sole database migration owner. Do not introduce Python migrations or schema creation at worker startup.
- Keep tests under `tests/unit` and `tests/integration`, mirroring `src/ragnarok_ingestion`. Database integration tests must use disposable infrastructure and committed migrations.
- Use pytest as the intended runner once installed. Existing unittest cases can run unchanged under pytest; prefer named test functions, plain assertions, and parametrization for new pytest tests. Justify new shared test setup when introduced.
