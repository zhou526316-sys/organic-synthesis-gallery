export const PUBLISHERS = ['acs', 'wiley', 'springer_nature', 'aaas', 'rsc', 'elsevier', 'ccs'];

export const PUBLISHER_LABELS = {
  acs: 'ACS',
  wiley: 'Wiley',
  springer_nature: 'Springer Nature',
  aaas: 'AAAS',
  rsc: 'RSC',
  elsevier: 'Elsevier / Cell Press',
  ccs: 'Chinese Chemical Society',
  other: 'Other',
};

export const TARGET_JOURNALS_BY_PUBLISHER = {
  acs: ['JACS', 'ACS Catalysis', 'Organic Letters'],
  wiley: ['Angew'],
  springer_nature: ['Nature', 'Nature Communications', 'Nature Chemistry', 'Nature Catalysis', 'Nature Synthesis'],
  aaas: ['Science', 'Science Advances'],
  rsc: ['Chemical Science', 'Green Chemistry'],
  elsevier: ['Chem'],
  ccs: ['CCS Chemistry'],
};

export function publisherForDoi(value) {
  const doi = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  if (doi.startsWith('10.1021/')) return 'acs';
  if (doi.startsWith('10.1002/')) return 'wiley';
  if (doi.startsWith('10.1038/')) return 'springer_nature';
  if (doi.startsWith('10.1126/')) return 'aaas';
  if (doi.startsWith('10.1039/')) return 'rsc';
  if (doi.startsWith('10.1016/')) return 'elsevier';
  if (doi.startsWith('10.31635/')) return 'ccs';
  return 'other';
}

export function articleUrlForPublisherDoi(value) {
  const doi = String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[?#].*$/, '');
  const publisher = publisherForDoi(doi);
  if (publisher === 'acs') return `https://pubs.acs.org/doi/${doi}`;
  if (publisher === 'wiley') return `https://onlinelibrary.wiley.com/doi/${doi}`;
  if (publisher === 'springer_nature') return `https://www.nature.com/articles/${doi.split('/')[1]}`;
  if (publisher === 'aaas') return `https://www.science.org/doi/${doi}`;
  if (publisher === 'rsc') return `https://doi.org/${doi}`;
  if (publisher === 'elsevier') return `https://doi.org/${doi}`;
  if (publisher === 'ccs') return `https://doi.org/${doi}`;
  return `https://doi.org/${doi}`;
}
