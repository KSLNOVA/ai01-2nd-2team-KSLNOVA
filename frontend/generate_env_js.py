#!/usr/bin/env python3
"""
간단한 .env 파서: YOUTUBE_API_KEY, OPENAI_API_KEY를 읽어 env.js로 덤프.
외부 패키지 없이 동작합니다.
"""
from pathlib import Path


def parse_env(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env

    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        env[key] = val
    return env


def js_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def main():
    script_dir = Path(__file__).resolve().parent           # /repo/frontend
    repo_root = script_dir.parent                          # /repo
    env_path = repo_root / ".env"                          # .env는 루트에 있다고 가정
    env = parse_env(env_path)

    yt = env.get("YOUTUBE_API_KEY", "")
    oa = env.get("OPENAI_API_KEY", "")
    endpoint = env.get("IMAGE_ANALYZE_ENDPOINT", "")

    js = (
        "window.ENV = {\n"
        f"  YOUTUBE_API_KEY: '{js_escape(yt)}',\n"
        f"  OPENAI_API_KEY: '{js_escape(oa)}',\n"
        f"  IMAGE_ANALYZE_ENDPOINT: '{js_escape(endpoint)}',\n"
        "};\n"
    )

    target = script_dir / "env.js"                         # 항상 frontend/env.js로 씀
    target.write_text(js, encoding="utf-8")
    print(f"{target} 생성 완료:")
    print(js)


if __name__ == "__main__":
    main()
