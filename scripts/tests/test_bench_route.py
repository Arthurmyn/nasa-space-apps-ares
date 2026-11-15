from scripts import bench_route


def test_the_benchmark_runs_both_cases_on_the_committed_site(capsys):
    assert bench_route.main(["--runs", "1"]) == 0
    out = capsys.readouterr().out
    assert "526 x 736 cells of 4 m" in out
    assert "boxwork: 5 stop(s)" in out and "longest: 1 stop(s)" in out
    assert "peak memory after the routes" in out


def test_the_longest_route_stays_well_under_the_limit_of_3_seconds(capsys):
    bench_route.main(["--runs", "1"])
    line = next(line for line in capsys.readouterr().out.splitlines() if line.startswith("longest:") and "median" in line)
    median = float(line.split("median ")[1].split(" s")[0])
    assert median < 3.0, line
