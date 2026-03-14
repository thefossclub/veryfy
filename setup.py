#!/usr/bin/env python3

import subprocess
import sys
import secrets
import shutil
from pathlib import Path

BOLD = "\033[1m"
GREEN = "\033[32m"
RED = "\033[31m"
CYAN = "\033[36m"
DIM = "\033[2m"
RESET = "\033[0m"


def info(msg):
    print(f"{CYAN}>{RESET} {msg}")


def ok(msg):
    print(f"{GREEN}✓{RESET} {msg}")


def die(msg):
    print(f"{RED}✗ {msg}{RESET}")
    sys.exit(1)


def heading(msg):
    print(f"\n{BOLD}{msg}{RESET}")


def dim(msg):
    print(f"{DIM}{msg}{RESET}")


def ask(prompt, default=None):
    """Prompt the user for input, showing the default in brackets"""
    if default is not None:
        line = input(f"  {prompt} [{default}]: ").strip()
        return line if line else default
    else:
        line = input(f"  {prompt}: ").strip()
        if not line:
            die(f"'{prompt}' is required.")
        return line


def ask_secret(prompt):
    """Prompt for a secret, generate one if none is provided"""
    print(f"  {prompt}")
    line = input("  Enter secret (leave empty to auto-generate): ").strip()
    if line:
        return line
    generated = secrets.token_hex(32)
    print(f"  Generated secret: {generated}")
    return generated


def run(cmd, *, check=True, capture=False, input_text=None):
    """Run a shell command, Raises on non-zero exit unless check=False"""
    return subprocess.run(
        cmd,
        shell=True,
        check=check,
        capture_output=capture,
        text=True,
        input=input_text,
    )


def require(binary):
    """Abort if a binary is not on PATH"""
    if not shutil.which(binary):
        msg = f"'{binary}' not found on PATH"
        die(msg)


def check_prerequisites():
    heading("Checking prerequisites")
    require("bun")
    ok("bun")
    require("psql")
    ok("psql")
    require("mailhog")
    ok("mailhog")


def collect_config():
    heading("Configuration")
    dim("Press enter to accept the default shown in brackets\n")

    cfg = {}
    cfg["db_host"] = ask("PostgreSQL host", "localhost")
    cfg["db_port"] = ask("PostgreSQL port", "5432")
    cfg["db_name"] = ask("Database name", "eventdb")
    cfg["db_user"] = ask("Database user", "eventuser")
    cfg["db_password"] = ask("Database password", "eventpass")
    cfg["hmac_secret"] = ask_secret("HMAC secret key")
    cfg["smtp_host"] = ask("SMTP host (MailHog)", "localhost")
    cfg["smtp_port"] = ask("SMTP port (MailHog)", "1025")
    cfg["smtp_from"] = ask("From address", "noreply@event.local")
    cfg["backend_port"] = ask("Backend port", "3000")

    return cfg


def setup_postgres(cfg):
    heading("PostgreSQL — creating user and database")

    # Create user & database
    sql = f"""\
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{cfg["db_user"]}') THEN
    CREATE USER {cfg["db_user"]} WITH PASSWORD '{cfg["db_password"]}';
  END IF;
END
$$;
SELECT 'CREATE DATABASE {cfg["db_name"]} OWNER {cfg["db_user"]}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '{cfg["db_name"]}')
\\gexec
"""

    info(f"Creating user '{cfg['db_user']}' and database '{cfg['db_name']}'...")
    info("(this runs as the system postgres user via sudo)")

    result = run(
        f"sudo -iu postgres psql -p {cfg['db_port']}",
        check=False,
        capture=True,
        input_text=sql,
    )

    if result.returncode != 0:
        print(result.stderr)
        die(
            "Could not connect to PostgreSQL.\n"
            "  Is it running?      sudo systemctl start postgresql\n"
        )

    ok(f"User '{cfg['db_user']}' and database '{cfg['db_name']}' ready")


def load_schema(cfg):
    heading("Loading database schema")

    schema = Path("backend/src/schema.sql")
    if not schema.exists():
        die(f"Schema not found at {schema} — are you in the repo root?")

    db_url = (
        f"postgres://{cfg['db_user']}:{cfg['db_password']}"
        f"@{cfg['db_host']}:{cfg['db_port']}/{cfg['db_name']}"
    )

    info(f"Applying {schema} ...")
    result = run(f"psql '{db_url}' -f {schema}", check=False, capture=True)

    if result.returncode != 0:
        print(result.stderr)
        die("Schema load failed")

    ok("Schema loaded.")


def write_env(cfg):
    heading("Writing backend/.env")

    env_file = Path("backend/.env")

    if env_file.exists():
        overwrite = ask("backend/.env already exists — overwrite?", "n").lower()
        if overwrite != "y":
            info("Skipping — using existing .env")
            return

    db_url = (
        f"postgres://{cfg['db_user']}:{cfg['db_password']}"
        f"@{cfg['db_host']}:{cfg['db_port']}/{cfg['db_name']}"
    )

    env_file.write_text(
        f"DATABASE_URL={db_url}\n"
        f"HMAC_SECRET={cfg['hmac_secret']}\n"
        f"SMTP_HOST={cfg['smtp_host']}\n"
        f"SMTP_PORT={cfg['smtp_port']}\n"
        f"SMTP_FROM={cfg['smtp_from']}\n"
        f"PORT={cfg['backend_port']}\n"
    )

    ok(f"Wrote {env_file}")
    dim("  This file is git-ignored, Never commit it")


def install_deps(name, directory):
    heading(f"Installing {name} dependencies")

    if not Path(directory).is_dir():
        info(f"No '{directory}/' found — skipping")
        return

    info(f"bun install in {directory}/ ...")
    result = run(f"cd {directory} && bun install", check=False, capture=True)

    if result.returncode != 0:
        print(result.stderr)
        die(f"bun install failed in {directory}/")

    ok(f"{name} dependencies installed")


def print_next_steps(cfg):
    p = cfg["backend_port"]
    heading("All done — next steps")

    print(f"""
  1. Start MailHog (separate terminal):
       {BOLD}MailHog{RESET}

  2. Start the backend (separate terminal):
       {BOLD}cd backend && bun run dev{RESET}

  3. Create an event:
       {BOLD}curl -X POST http://localhost:{p}/events \\
         -H "Content-Type: application/json" \\
         -d '{{"name":"Your Event Name","date":"2026-04-30"}}'{RESET}

   4. Place your attendees CSV in the repo root as {BOLD}attendees.csv{RESET}
        Expected columns:
            {DIM}name, email, university, profile_link{RESET}

  5. Import attendees (use the UUID returned above as EVENT_ID):
       {BOLD}curl -X POST http://localhost:{p}/attendees/import \\
         -F "eventId=EVENT_ID" \\
         -F "csv=@attendees.csv"{RESET}

  6. View emails in MailHog:
       {BOLD}http://localhost:8025{RESET}

  7. Get your LAN IP for the Expo app:
       {BOLD}ip a{RESET}
     Then set in expo-app/constants/config.ts:
       {BOLD}export const BASE_URL = "http://<your-ip>:{p}";{RESET}

  8. Start the Expo app:
       {BOLD}cd expo-app && npx expo start{RESET}
""")


def main():
    print(f"\n{BOLD}veryfy — setup{RESET}")
    dim("run this from the repo root\n")

    if not Path("backend").is_dir() and not Path("expo-app").is_dir():
        die("Neither backend/ nor expo-app/ found. Are you in the repo root?")

    check_prerequisites()
    cfg = collect_config()
    setup_postgres(cfg)
    load_schema(cfg)
    write_env(cfg)
    install_deps("backend", "backend")
    install_deps("Expo app", "expo-app")
    print_next_steps(cfg)


if __name__ == "__main__":
    main()
