'use strict';

function publicCatalogPayload(catalog) {
  const {
    cache,
    dirty,
    dirtyAt,
    lastSuccessfulRefreshAt,
    quarantine,
    outcomes,
    refreshDueAt,
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
