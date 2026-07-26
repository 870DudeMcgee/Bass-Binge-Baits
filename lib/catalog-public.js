'use strict';

function publicCatalogPayload(catalog) {
  const {
    quarantine,
    outcomes,
    legacy,
    ...publicCatalog
  } = catalog || {};
  const publicLegacy = legacy
    ? Object.fromEntries(Object.entries(legacy).filter(([key]) => key !== 'errors'))
    : legacy;

  return {
    ...publicCatalog,
    legacy: publicLegacy
  };
}

module.exports = {
  publicCatalogPayload
};
