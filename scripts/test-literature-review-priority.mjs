import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isHighRelevanceCandidate} from './lib/literature-review-priority.mjs';
const cases=[
  'One-step skeletal editing of oxetanes to thietanes using thiourea',
  'Iridium-Catalyzed Asymmetric Hydrogenation of Pyridazine Salts under Batch and Flow',
  'Circularly Polarized Light-Driven Absolute Asymmetric Photodimerization via Dynamic Prochiral Supramolecular Assembly',
  'Synthesis of Diaryl α-Hydroxycarboxylic Acid Derivatives via Three-Component Reactions of o-Quinone Diimides with Alcohols and Diazo Compounds',
  'Direct Enantioselective α-Alkoxylation of β-Keto Esters Enabled by Umpolung Strategy',
  'Modular Access to Tetrasubstituted Allenes via 1,4-Dialkylation of 1,3-Enynes',
  'Electrochemical Control of Scholl Reaction: Arenium Cation Versus Radical Cation Pathways',
  'Rhodium-Catalyzed Regioselective Cross-Coupling of Vinyl Halides',
  'Efficient Photocatalytic Synthesis of Chiral Pyridines',
  'Catalytic Asymmetric Hydroamination of Alkenes',
  'Enantioselective Photocycloaddition of Quinone Methides',
  'Decarboxylative Amination through LMCT Activation',
  'Formal Total Synthesis of Complex Natural Products',
  'Skeletal Editing of Oxetanes Using Thiourea',
];
test('known Oct 12 Nature Synthesis title, high-relevance catalytic transformations and compounds rank HIGH with no abstract',()=>{
  for(const title of cases){
    assert.equal(isHighRelevanceCandidate({title,journal:'Nature Synthesis',abstract:''}),true,title);
  }
});
test('keyword ranking never relies on body text being available first',()=>{
  assert.equal(isHighRelevanceCandidate({title:'One-step skeletal editing of oxetanes to thietanes using thiourea',abstract:'',journal:'Nature Synthesis'}),true);
  assert.equal(isHighRelevanceCandidate({title:'Synthetic Materials',journal:'Nature Communications',abstract:'some experimental',topics:['Organic Chemistry']}),true);
});
test('non-research issue, cover and correction titles stay low despite synthetic keywords',()=>{
  const titles=['Outside Back Cover: Synthesis of Aminocyclopropanes by Redox-Neutral Aminoalkylation',
    'Publisher Correction: Catalytic Cross-Coupling of Organic Substrates',
    'Review: Advances in Electrochemical Catalysis','Issue Publication Information',
    'News: Skeletal Editing of Molecular Scaffolds'];
  for(const title of titles)assert.equal(isHighRelevanceCandidate({title,journal:'Angew'}),false,title);
});
test('journal category fallback is priority only and avoids obviously nonchemical biology',()=>{
  assert.equal(isHighRelevanceCandidate({title:'New Alkyl Compounds',journal:'Organic Letters'}),true);
  assert.equal(isHighRelevanceCandidate({title:'Patient clinical trials',journal:'Organic Letters'}),false);
  assert.equal(isHighRelevanceCandidate({title:'Changes in ocean currents',journal:'Nature Communications'}),false);
});
