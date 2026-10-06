# WeChat editorial working plan — 2026-10-06

Status: internal working document; do not publish directly.
Selected papers:
- 今日精选 — Nature Chemistry — DOI 10.1038/s41557-026-02237-z
- 往期精选 — Nature — Hyster — DOI 10.1038/s41586-026-10930-9

## Shared editorial rule

Both articles must move from an intuitive reaction picture to the deepest defensible logic. Do not front-load jargon. Every image answers one question only. Multi-panel figures are split into argument-specific crops. The WeChat draft is written only after this text/visual plan passes internal QA.

## 今日精选 narrative

Core question: **Two transient alkyl radicals are individually easy to make; why is it hard to make the two different radicals meet each other rather than themselves?**

Reading path:
1. Show only the current carboxylic-acid + boronic-acid cross-coupling.
2. Explain why two transient radicals create a flux problem: A-A, A-B and B-B are all fast possibilities.
3. Show that alternating-polarity electrolysis fixes overoxidation/electrode passivation but leaves homocoupling dominant.
4. Use the opposite preactivation experiments to identify redox mismatch as the unresolved bottleneck.
5. Explain TMAF as a **speciation controller**: carboxylate and mono-/difluoroboronates converge near ~0.8 V; excess fluoride shifts boron toward BF3 species near ~1.2 V and recreates mismatch.
6. Use CV + 19F NMR as evidence that the argument is about actual solution species, not an abstract reagent effect.
7. Explain water/B2O3 through the same speciation logic: water destroys the useful fluoroboronate population and can feed inactive Bpin formation.
8. Separate the roles of electrode material and waveform: carbon electrode raises the second-oxidation threshold; AP limits surface passivation.
9. Explain the approximately statistical 2:1:1 cross-/homo-coupling relationship: the method controls radical generation flux rather than molecular recognition between radicals.
10. End with what synthetic capability is purchased and the real operating boundaries.

Image plan:
- nc_f1_reaction — Fig.1c only; opening reaction.
- nc_f1_failed — Fig.1e only; why AP alone is insufficient.
- nc_f1_design — Fig.1d only; redox mismatch + synchronized activation concept.
- nc_f2_speciation — Fig.2b only; TMAF-controlled precursor states.
- nc_f2_evidence — Fig.2d–f only; CV/19F NMR evidence for the redox window.
- nc_f2_conditions — Fig.2a+c only; TMAF equivalents / commercial vs hydroboration comparison.
- nc_f3_electrode — Fig.3a only; Pt vs glassy carbon second oxidation.
- nc_f3_passivation — Fig.3b–c only; passivation vs reversal.
- nc_f3_mechanism — Fig.3d only; radical generation and statistical coupling.
- nc_table1_header — Table 1 reaction header / one-pot hydroboration concept only.
- nc_fig4_tandem — only the tandem/synthetic-utility panel used in the final application section.

## 往期精选 narrative

Core question: **How can a PLP intermediate that is poor at harvesting light be turned into a useful photoredox centre, while two short-lived radicals are simultaneously kept inside a chiral environment long enough to form one stereodefined bond?**

This retains the prior 文献解析-project interpretation:
- Rh6G mainly solves light harvesting; it does not replace [Q]* as the key reductant.
- The enzyme is mechanistically important for forming/stabilizing the non-native quinonoid, colocalizing the radical pair, and stereocontrolling an otherwise very fast radical-radical recombination.
- The conceptual advance is “FRET light harvesting + excited enzyme-bound PLP + radical-pair colocalization,” not simply “PLP participates in photochemistry.”
- The scope/claim must remain narrow because amino-acid-derived quinonoids do not show the same useful photoactivity.

Reading path:
1. Show only the current asymmetric radical-radical reaction, not the whole Fig.1.
2. Explain the two coupled difficulties in plain language: [Q] is a poor direct light harvester, while two transient radicals are difficult to sort and stereocontrol in solution.
3. Clarify what is new relative to earlier PLP photobiocatalysis: enzyme-bound excited PLP itself enters the catalytic photochemical cycle.
4. Explain FRET slowly:
   - donor/acceptor;
   - spectral overlap;
   - distance/orientation dependence;
   - why Rh6G can be a good antenna without being a sufficiently strong direct reductant of the pyridinium salt.
5. Separate **exogenous FRET** from **intra-enzyme FRET**.
6. Evidence ladder for exogenous FRET:
   - direct [Q] excitation gives only modest product;
   - 470-nm Rh6G excitation gives much higher product;
   - Stern–Volmer quenching;
   - donor emission / acceptor absorption overlap.
7. Intra-enzyme FRET:
   - external aldimine [A]* can transfer energy to neighbouring [Q];
   - active sites in the homotetramer are ~3, 4 and 5 nm apart;
   - 445-nm, Rh6G-free reactivity improves during evolution.
   - Do **not** overclaim that evolution necessarily improved FRET efficiency; peer review forced the final wording to remain cautious because absorption coefficients/speciation also change.
8. Directed evolution:
   - WT already gives very high e.r. but poor yield;
   - mutations mainly improve efficiency, not a simple “more quinonoid = more product” relationship;
   - active-site geometry/photophysics co-evolve.
9. Validate [Q]* as the reductant using lifetime, quenching and redox-window evidence.
10. Explain radical-pair colocalization as the stereochemical solution: [Q]* SET creates SQ and the substrate radical in/near the same active site.
11. Peer review narrows the claim: non-native benzylamine-derived quinonoids are the demonstrated photoactive regime; native amino-acid-derived quinonoids remain outside it.
12. End with substrate limitations and Lenacapavir-core application without turning an analytical yield into a process claim.

Image plan:
- hy_f1_reaction — Fig.1c left reaction only; opening.
- hy_f1_darkspace — Fig.1a “cofactor dark space + PLP states” crop.
- hy_f1_fret_concept — Fig.1c middle/right Rh6G → quinonoid concept crop.
- hy_f2_evolution — Fig.2b only; yield evolution.
- hy_f2_active_site — Fig.2c only; mutations around the active site.
- hy_f4_scheme — Fig.4a only; external vs intra-enzyme FRET schematic.
- hy_f4_stern — Fig.4b only; Rh6G Stern–Volmer.
- hy_f4_overlap — Fig.4c only; spectral overlap.
- hy_f4_internal — Fig.4d–e only; internal FRET + 3/4/5 nm geometry.
- hy_f5_lifetime — Fig.5a–b only; [Q]* quenching/lifetime.
- hy_f5_redox — Fig.5c–e only; redox ladder and alternative-path controls.
- hy_f5_mechanism — Fig.5f only; complete catalytic mechanism.
- hy_f5_lenacapavir — Fig.5g only; application.

## Retrospective cover

No subtitle.
Create a dedicated abstract cover, not a shrunken paper panel:
- deep navy / blue editorial background;
- header: 往期精选 | Nature | Hyster;
- main Chinese paper title;
- abstract FRET visual: incoming magenta light → Rh6G donor → gold energy-transfer arc → PLP* inside an abstract enzyme pocket → paired radical dots;
- small original reaction crop at the bottom as factual anchor;
- no award/credential/date slogans;
- no AI-redrawn chemical structures in the abstract portion.

The cover must remain legible in the actual WeChat secondary-card crop.
