# Locust load tests

Load tests for REDCap on AWS using [Locust](https://locust.io/).

## Prerequisites

Choose one of the two ways to run the tests.

### Option A — Local Python environment

Requires Python 3.9+.

```sh
# from tests/loadtest/locust
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Run Locust with the web UI:

```sh
locust -f locustfile.py
```

Then open http://localhost:8089 and set the target host, number of users, and spawn rate.

Run headless (no UI) against a target host:

```sh
locust -f locustfile.py --headless -u 100 -r 10 --run-time 5m -H https://your-redcap-host
```

- `-u` total users
- `-r` spawn rate (users started per second)
- `--run-time` how long to run
- `-H` target host (overrides the `host` set in `locustfile.py`)

### Option B — Docker Compose (distributed: 1 master + 3 workers)

Requires Docker. No local Python install needed — the official `locustio/locust`
image already includes Locust.

```sh
# from tests/loadtest/locust
docker compose -f Compose.yaml up
```

Open http://localhost:8089 for the master web UI.

Tear down:

```sh
docker compose -f Compose.yaml down
```

## Notes

- `WebsiteUser` in `locustfile.py` defaults to `host = http://127.0.0.1:8089`.
  Override it in the web UI or with the `-H` flag to point at your target.
- `FastHttpUser` uses `geventhttpclient`, which ships with the `locust`
  package, so no extra dependency is required.
