import argparse
import sys
import httpx
import json

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
    
    args = parser.parse_args()
    
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
