# Procedural Zhuozhengyuan

Zhuoyang Pan

![West view from Wuzhu Youju](img/ref/west_view.jpg)

*The target: looking west from Wuzhu Youju across the central pond of Zhuozhengyuan (Humble Administrator's Garden), with the Beisi Pagoda behind the garden wall. Photo: Zhangzhugang, [Commons](https://commons.wikimedia.org/wiki/File:Suzhou_Zhuozheng_Yuan_2015.04.23_08-13-49.jpg), CC BY-SA 4.0*

# Design Doc

## Introduction

Zhuozhengyuan is the most famous of the Suzhou gardens, and this is one of its best-known views. Standing at Wuzhu Youju at the east end of the pond, you look across water, lotus, rocks and pavilions, and the Beisi Pagoda (outside the garden, 9 storeys) shows up in the middle of the frame like it belongs there. Garden designers call this a "borrowed view".

A lot of what makes the view work is rule based, which is why I want to build it procedurally:
- lattice windows follow a few construction conventions (Stiny wrote a shape grammar for the "ice-ray" ones)
- garden rocks are judged on four named qualities: thin, wrinkled, perforated, see-through
- roof curves come from a 12th-century building manual (the *Yingzao Fashi*)

A procedural Chinese garden was done last year ([Yuanlin](https://github.com/SirEnri2001/Houdini-Yuanlin)), as a whole-garden layout seen from above. Mine is the opposite: one real view, from eye level, with the detail going into the pieces (lattice, rocks, roofs) instead of the overall layout.

## Goal

Recreate the west view from Wuzhu Youju in Houdini with procedural tools, and render it in Karma next to the reference photo.
- each element is its own HDA: lattice window, Taihu rock, pavilion, pagoda
- the scene around them (pond, shore, lotus, bridges, willows) is driven by curves and a seed
- final output: the hero shot matched to the photo, a "framed view" shot through one of Wuzhu Youju's round openings, and a short camera move

## Inspiration/reference

| Same view in autumn | Wuzhu Youju (camera position) |
|:--:|:--:|
| <img src="img/ref/west_view_autumn.jpg" height="300"> | <img src="img/ref/wuzhu_youju.jpg" height="300"> |
| Photo: King of Hearts, [Commons](https://commons.wikimedia.org/wiki/File:Humble_Administrator%27s_Garden_Suzhou_November_2017_006.jpg), CC BY-SA 4.0 | Photo: Soramimi, [Commons](https://commons.wikimedia.org/wiki/File:Wuzhuyouju_of_Zhuozhengyuan_Garden.JPG), CC BY-SA 4.0 |

| Lotus pond | Moon gate | Pavilion roof |
|:--:|:--:|:--:|
| <img src="img/ref/lotus_pond.jpg" height="240"> | <img src="img/ref/moon_gate.jpg" height="240"> | <img src="img/ref/pavilion_roof.jpg" height="240"> |
| Photo: Soramimi, [Commons](https://commons.wikimedia.org/wiki/File:Wuzhuyouju_and_Lotus_of_Zhuozhengyuan_Garden.JPG), CC BY-SA 4.0 | Photo: Jakub Hałun, [Commons](https://commons.wikimedia.org/wiki/File:20090905_Suzhou_Humble_Administrator%27s_Garden_4605.jpg), CC BY-SA 3.0 | Photo: Lamassu Design Gurdjieff, [Commons](https://commons.wikimedia.org/wiki/File:Humble_garden_pavilion_in_lotus_breeze.jpg), CC BY-SA 3.0 |

| Taihu rock (Guanyun Peak, Lingering Garden) | Lattice window |
|:--:|:--:|
| <img src="img/ref/guanyun_peak.jpg" height="300"> | <img src="img/ref/round_lattice_window.jpg" height="300"> |
| Photo: 颐园居, [Commons](https://commons.wikimedia.org/wiki/File:Lingering_Garden_-_%E6%B9%96%E7%9F%B3%E5%86%A0%E4%BA%91%E5%B3%B0_20220904.jpg), CC BY-SA 4.0 | Photo: kevinmcgill, [Commons](https://commons.wikimedia.org/wiki/File:Round_Window_(6399130989).jpg), CC BY-SA 2.0 |

Reading:
- G. Stiny, [Ice-Ray: A Note on the Generation of Chinese Lattice Designs](https://doi.org/10.1068/b040089), *Environment and Planning B* 4(1), 1977
- D. S. Dye, *A Grammar of Chinese Lattice* (Dover reprint: *Chinese Lattice Designs*), where Stiny's examples come from
- Y. Shen, E. Zhang, Y. Feng, S. Liu, J. Wang, [Parameterizing the Curvilinear Roofs of Traditional Chinese Architecture](https://doi.org/10.1007/s00004-020-00512-1), *Nexus Network Journal* 23(2), 2021
- [Scholar's rocks](https://pages.stolaf.edu/chinese-scholars-studio/scholar-rocks/) (St. Olaf), on the four qualities: *shou* (thin), *zhou* (wrinkled), *lou* (perforated), *tou* (see-through)
- [Humble Administrator's Garden](https://en.wikipedia.org/wiki/Humble_Administrator%27s_Garden) (Wikipedia) and [The Garden of the Inept Administrator](https://hiddenarchitecture.net/the-garden-of-the-inept-administrator/) (Hidden Architecture) for the layout and the borrowed view

## Specification

Everything in Houdini 22 (Apprentice), one hip file, Karma for the renders.

Core:
1. **`lattice_window` HDA**: ice-ray pattern from a shape grammar plus one regular pattern; frame shape (rectangle, circle, octagon); bar width/depth; seed
2. **`taihu_rock` HDA**: sliders for the four qualities (thin, wrinkled, perforated, see-through), size and seed
3. **`pavilion` HDA**: 4/6/8-sided plan, columns, bench rail, walls with round openings (for Wuzhu Youju), curved roof with upturned corners and a finial
4. **`pagoda` HDA**: octagonal storeys stacked and tapered, each one reusing the pavilion's eave and roof code, spire on top
5. **Scene**: pond from a curve, rocks along the shore, lotus on the water, flat stone bridges, willows, garden wall with lattice windows, pagoda placed far behind the wall
6. **Look**: whitewash, grey tile, dark wood, limestone and water materials; hazy daylight so the pagoda fades with distance; camera matched to the reference photo

Stretch (only if core is done by Milestone 2):
- willow branches moving in wind (vellum hair, same setup as my hw03 tentacles)
- season switch: each side of Wuzhu Youju is said to look out on a different season, so a spring/autumn preset for foliage colour and lotus
- ripples on the water, a few koi

## Techniques

**Ice-ray lattice** (Stiny 1977)
- start with the window rectangle as one polygon
- each step picks the biggest piece and splits it with one straight bar between two of its edges; the rules only let a triangle, quad or pentagon split into two smaller ones of those kinds, which is what gives the cracked-ice look
- stop when every piece is under a minimum area
- for-each loop with feedback (same setup as hw04), the split itself in a wrangle
- edges -> bars (`polyexpand2d` + extrude), then clip by the frame shape

**Taihu rock** (VDB)
- *thin*: 3-5 noisy spheres along a bent vertical spine, smooth union; height/width ratio slider
- *see-through*: a few tunnel curves between random points on opposite sides, bent with curl noise, turned into VDB tubes and subtracted
- *perforated*: Worley noise pits ([Worley 1996](https://doi.org/10.1145/237170.237267)) subtracted from the SDF
- *wrinkled*: ridged FBM with domain warping ([Quilez](https://iquilezles.org/articles/warp/)), stretched along the spine so grooves run mostly vertical
- convert to polygons, reduce, occlusion/curvature attribute to darken the holes

**Roofs** (Shen et al. 2021, *juzhe* from the *Yingzao Fashi*)
- roof section: draw a straight line from ridge to eave, drop the first purlin under the ridge by 1/10 of the rise, redraw the line from there to the eave and drop the next one by 1/20, then 1/40, halving each time; that gives the concave curve
- corners lift and push outward (*qiqiao*), blended along the eave
- roof surface lofted from those section curves, tiles copied along its rows, same "kit shapes on points" trick as hw04 for columns and rails

**Pagoda**
- one storey = octagonal pavilion body + eave, from the pavilion HDA
- storey radius and height shrink with a taper curve, 9 storeys, spire on top
- it's far away in the shot, so silhouette and proportions matter more than detail

**Scene**
- pond: closed curve + noise, water surface and a sunken bed
- shore: rocks scattered in a band around the pond, relaxed so they don't overlap, bigger near the water
- lotus: scatter on the water with a noise mask so they clump
- willows: trunk and branches from an L-system (lab05), hanging strands as curves with gravity droop, leaves copied on
- camera: match the reference photo's focal length and horizon ([fSpy](https://fspy.io/)), then place the big pieces to line up with it

## Design

```mermaid
flowchart LR
    LW[lattice_window HDA] --> WALL[Garden wall]
    PV[pavilion HDA] --> PG[pagoda HDA]
    PV --> BLD[Wuzhu Youju + island pavilion]
    TR[taihu_rock HDA] --> SH[Shore rocks]
    C[Layout curves + seed] --> POND[Pond, lotus, bridges]
    C --> SH
    C --> WALL
    C --> WIL[Willows]
    BLD --> SC[Scene]
    PG --> SC
    WALL --> SC
    POND --> SC
    SH --> SC
    WIL --> SC
    CAM[Camera matched to photo] --> K
    SC --> M[Materials] --> K[Karma render]
```

## Timeline

| Week | Work | Due |
|:--|:--|:--|
| **11/4 - 11/11** (Milestone 1) | - camera matched to the reference photo, blockout with boxes<br>- `lattice_window`: ice-ray grammar working, frame shapes<br>- `taihu_rock` v1: base shape + tunnels + noise<br>- `pavilion` v1: plan, columns, rails, straight roof | 11/11 |
| **11/12 - 11/18** | - *juzhe* roof curve + corner lift<br>- `pagoda` from stacked storeys<br>- Wuzhu Youju with round openings<br>- rock sliders for the four qualities | |
| **11/19 - 11/23** (Milestone 2) | - pond, shore rocks, lotus, bridges, willows, wall with lattice windows<br>- first materials and Karma renders of the hero shot<br>- feature complete, cut what's left | 11/23 |
| **11/24 - 11/30** (Final) | - lighting, haze, side by side with the photo<br>- framed-view shot through a round opening, camera move<br>- stretch goals if there's time<br>- README results + post mortem | 11/30 |

Backup plans:
- if the *juzhe* roof eats too much time, fall back to a straight hip roof with just the corner lift
- if VDB booleans get slow, cache each rock variant once and copy them around as packed prims
- willows can be simple static curves if the L-system + droop doesn't look right in time
