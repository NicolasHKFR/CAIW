import argparse
import asyncio
import os
import signal
import sys
import uvicorn


def _handle_shutdown(server: uvicorn.Server) -> None:
    loop = asyncio.get_event_loop()
    loop.call_soon_threadsafe(server.shutdown)


def main():
    parser = argparse.ArgumentParser(description="CAIW Backend Server")
    parser.add_argument("--port", type=int, default=8000, help="Server port")
    parser.add_argument("--db-path", type=str, default="./data/caiw.db", help="Database path")
    parser.add_argument("--assets-path", type=str, default="./assets", help="Assets directory")
    args = parser.parse_args()

    os.environ["DATABASE_PATH"] = args.db_path
    os.environ["ASSETS_PATH"] = args.assets_path

    config = uvicorn.Config(
        "app.main:app",
        host="127.0.0.1",
        port=args.port,
        reload=False,
        log_config=None,
    )
    server = uvicorn.Server(config)

    if sys.platform != "win32":
        loop = asyncio.new_event_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                loop.add_signal_handler(sig, server.shutdown)
            except NotImplementedError:
                pass

    try:
        server.run()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
