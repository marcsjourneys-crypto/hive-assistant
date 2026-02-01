"""
Hive Script Runner

Wrapper that enforces the run(inputs) -> dict contract for user scripts.
Called by ScriptRunner (Node.js) as:
  python runner.py <script_path> <input_path> <output_path>

The script must define a `run(inputs)` function that accepts a dict
and returns a dict.
"""

import sys
import json
import importlib.util
import traceback


def main():
    if len(sys.argv) != 4:
        print("Usage: runner.py <script_path> <input_path> <output_path>", file=sys.stderr)
        sys.exit(1)

    script_path = sys.argv[1]
    input_path = sys.argv[2]
    output_path = sys.argv[3]

    # Load inputs
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            inputs = json.load(f)
    except Exception as e:
        write_error(output_path, f"Failed to read inputs: {e}")
        sys.exit(1)

    # Load user script as module
    try:
        spec = importlib.util.spec_from_file_location("user_script", script_path)
        if spec is None or spec.loader is None:
            write_error(output_path, f"Cannot load script: {script_path}")
            sys.exit(1)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except Exception as e:
        write_error(output_path, f"Failed to load script: {e}\n{traceback.format_exc()}")
        sys.exit(1)

    # Verify run() exists
    if not hasattr(module, "run") or not callable(module.run):
        write_error(output_path, "Script must define a callable `run(inputs)` function")
        sys.exit(1)

    # Execute
    try:
        result = module.run(inputs)
    except Exception as e:
        write_error(output_path, f"Script error: {e}\n{traceback.format_exc()}")
        sys.exit(1)

    # Validate output
    if not isinstance(result, dict):
        write_error(output_path, f"run() must return a dict, got {type(result).__name__}")
        sys.exit(1)

    # Write output
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, default=str)
    except Exception as e:
        write_error(output_path, f"Failed to write output: {e}")
        sys.exit(1)


def write_error(output_path, message):
    """Write a structured error to the output file."""
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump({"__error": message}, f)
    except Exception:
        # Last resort: print to stderr
        print(message, file=sys.stderr)


if __name__ == "__main__":
    main()
