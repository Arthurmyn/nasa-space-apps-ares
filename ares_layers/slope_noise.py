# Slope noise from i.i.d. DTM height error sigma_z (m) at grid spacing d (m).
# Analytic: Horn sigma_p = sqrt(12)/8 * sz/d ; Zevenbergen-Thorne sigma_p = sz/(sqrt(2) d)
# Flat terrain: noise slope magnitude ~ Rayleigh(sigma_p): mean = sigma_p*sqrt(pi/2), 95th pct = sigma_p*sqrt(-2 ln 0.05)
# Monte Carlo independent check: Horn on pure-noise grids (+ on a 15 deg plane).
import numpy as np
rng=np.random.default_rng(0)
def horn(z,d):
    a,b,c=z[:-2,:-2],z[:-2,1:-1],z[:-2,2:]; dd,f=z[1:-1,:-2],z[1:-1,2:]; g,h,i=z[2:,:-2],z[2:,1:-1],z[2:,2:]
    p=((c+2*f+i)-(a+2*dd+g))/(8*d); q=((g+2*h+i)-(a+2*b+c))/(8*d); return np.degrees(np.arctan(np.hypot(p,q)))
print("sz[m] d[m] | Horn sig_p[deg] ZT sig_p[deg] | flat mean/p95 Horn analytic | MC mean/p95 | MC sd on 15deg plane")
for sz in (0.1,0.2,0.3):
  for d in (1,3,5):
    sh=np.degrees(np.sqrt(12)/8*sz/d); szt=np.degrees(sz/(np.sqrt(2)*d))
    mean=sh*np.sqrt(np.pi/2); p95=sh*np.sqrt(-2*np.log(0.05))
    z=rng.normal(0,sz,(600,600)); s=horn(z,d)
    X=np.arange(600)*d; plane=np.tile(X*np.tan(np.radians(15)),(600,1))
    s15=horn(plane+rng.normal(0,sz,(600,600)),d)
    print(f"{sz:.1f} {d} | {sh:5.2f} {szt:5.2f} | {mean:5.2f}/{p95:5.2f} | {s.mean():5.2f}/{np.percentile(s,95):5.2f} | {s15.std():5.2f} (analytic {sh*np.cos(np.radians(15))**2:5.2f})")
# 1 m DTM block-averaged 5x5 to 5 m then Horn at 5 m (i.i.d. => sz/5)
for sz in (0.1,0.2,0.3):
    z=rng.normal(0,sz,(1000,1000)).reshape(200,5,200,5).mean(axis=(1,3)); s=horn(z,5)
    print(f"agg5 sz={sz}: MC mean {s.mean():.3f} deg, p95 {np.percentile(s,95):.3f}; analytic mean {np.degrees(np.sqrt(12)/8*sz/5/5)*np.sqrt(np.pi/2):.3f}")
