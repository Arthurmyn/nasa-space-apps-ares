#!/usr/bin/env bash
# Build all ARES map layers.   ./run_all.sh            -> real data in data/, outputs in out/
#                              ./run_all.sh synthetic  -> SYNTHETIC test data, outputs in out_synthetic/
set -u
cd "$(dirname "$0")"
export ARES_MODE="${1:-real}"
[ "$ARES_MODE" = "synthetic" ] && python make_synthetic.py
python -m pytest -q tests || { echo "TESTS FAILED - stop"; exit 1; }
fail=0
for s in make_slope.py make_optical.py make_thermal.py check_location.py radiation_card.py fetch_donki.py fetch_mcd.py; do
  echo "== $s"; python "$s" || { echo "!! $s failed (continuing)"; fail=1; }
done
echo "outputs in $( [ "$ARES_MODE" = synthetic ] && echo out_synthetic || echo out )/"; exit $fail
