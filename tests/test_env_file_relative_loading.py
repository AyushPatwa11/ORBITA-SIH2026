from pathlib import Path


def test_settings_reads_repo_env_from_any_working_directory(monkeypatch):
    repo_root = Path(__file__).resolve().parents[1]
    monkeypatch.chdir(repo_root.parent)

    import importlib
    import sys

    sys.path.insert(0, str(repo_root))
    config_module = importlib.import_module("apps.api.core.config")
    importlib.reload(config_module)

    settings = config_module.Settings()
    assert settings.database_url == "postgresql+asyncpg://orbita:change_me@localhost:5432/orbita"
    assert settings.redis_url == "redis://localhost:6379/0"
