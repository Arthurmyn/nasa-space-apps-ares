"""Generate synthetic terrain in exactly the same format as the real DTM grid."""

if __package__:
    from .make_slope_grid import main
else:
    from make_slope_grid import main


if __name__ == "__main__":
    main(fake=True)
