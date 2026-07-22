import argparse
import sys
import httpx
import json

from src.rudataanalyst_sql.serve.registry import (
    list_registered_schemas, inspect_schema, add_sqlite_schema, remove_schema
)

DEFAULT_URL = "http://127.0.0.1:8000"

def main():
    parser = argparse.ArgumentParser(description="RuDataAnalyst-SQL CLI Client")
    parser.add_argument("--url", default=DEFAULT_URL, help="API URL")
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    subparsers.add_parser("health", help="Check API health")
    subparsers.add_parser("list-domains", help="List available demo domains")
    
    gen_parser = subparsers.add_parser("generate", help="Generate SQL for a question")
    gen_parser.add_argument("--domain", required=True)
    gen_parser.add_argument("--question", required=True)
    
    query_parser = subparsers.add_parser("query", help="Generate and execute SQL")
    query_parser.add_argument("--domain", required=True)
    query_parser.add_argument("--question", required=True)
    
    schema_parser = subparsers.add_parser("schema", help="Manage local schema registry")
    schema_sub = schema_parser.add_subparsers(dest="schema_cmd", required=True)
    
    schema_sub.add_parser("list", help="List registered schemas")
    
    ins_p = schema_sub.add_parser("inspect", help="Inspect a registered schema")
    ins_p.add_argument("id", help="Schema ID")
    
    add_p = schema_sub.add_parser("add-sqlite", help="Add a local SQLite DB to registry")
    add_p.add_argument("--id", required=True, help="Safe alphanumeric ID")
    add_p.add_argument("--db", required=True, help="Local path to SQLite file")
    
    rem_p = schema_sub.add_parser("remove", help="Remove a registered schema")
    rem_p.add_argument("id", help="Schema ID")
    rem_p.add_argument("--yes", action="store_true", help="Confirm removal")
    
    args = parser.parse_args()
    
    if args.command == "schema":
        try:
            if args.schema_cmd == "list":
                schemas = list_registered_schemas()
                print(json.dumps(schemas, indent=2, ensure_ascii=False))
            elif args.schema_cmd == "inspect":
                manifest = inspect_schema(args.id)
                print(json.dumps(manifest, indent=2, ensure_ascii=False))
            elif args.schema_cmd == "add-sqlite":
                add_sqlite_schema(args.id, args.db)
                print(f"Schema {args.id} successfully registered.")
            elif args.schema_cmd == "remove":
                if not args.yes:
                    print("You must pass --yes to confirm removal.")
                    sys.exit(1)
                remove_schema(args.id)
                print(f"Schema {args.id} removed.")
        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)
        return
        
    client = httpx.Client(timeout=300.0) # 5 min timeout for model loading/inference
    
    try:
        if args.command == "health":
            resp = client.get(f"{args.url}/health")
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
        elif args.command == "list-domains":
            resp = client.get(f"{args.url}/v1/domains")
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
        elif args.command == "generate":
            resp = client.post(f"{args.url}/v1/sql/generate", json={"domain": args.domain, "question": args.question})
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
        elif args.command == "query":
            resp = client.post(f"{args.url}/v1/sql/query", json={"domain": args.domain, "question": args.question})
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Error connecting to server {args.url}: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
