# Python worker instructions

- Python is a learning language for the user. Work in small steps and explain each new construct, its runtime behavior, and its TypeScript equivalent when useful.
- Before adding a library, explain the concrete problem it solves and why the standard library or an existing dependency is insufficient.
- Use uv for dependencies and execution. The user runs dependency, environment, and infrastructure setup commands as part of the learning flow; inspect and verify the results afterward.
- Keep `pyproject.toml` as the dependency declaration and let uv generate `uv.lock`. Do not edit the lockfile manually.
- Use typed named functions and small data objects. Do not use `Any`. Explain that annotations do not enforce runtime validation.
- Use dataclasses for internal values. Consider Pydantic for untrusted message inputs when the consumer is implemented; validate strict types and reject unexpected fields explicitly.
- Keep the future RabbitMQ entry point thin. Python ingestion services own workflows and transactions; repositories own parameterized SQL.
- Drizzle remains the sole database migration owner. Do not introduce Python migrations or schema creation at worker startup.
- Keep tests under `tests/unit` and `tests/integration`, mirroring `src/ragnarok_ingestion`. Database integration tests must use disposable infrastructure and committed migrations.
- Use pytest as the intended runner once installed. Existing unittest cases can run unchanged under pytest; prefer named test functions, plain assertions, and parametrization for new pytest tests. Explain fixtures before introducing shared setup.
