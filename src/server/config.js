const config = {
  port: parseInt(process.env.PORT || '2525', 10),
  defaultPage: process.env.DEFAULT_PAGE || 'homepage',
  bookmarksDir: process.env.BOOKMARKS_DIR || './bookmarks',
  iconsDir: process.env.ICONS_DIR || './icons',
  faviconCacheDir: process.env.FAVICON_CACHE_DIR || './favicon-cache',
  customCssPath: process.env.CUSTOM_CSS_PATH || './custom.css',
  footerPath: process.env.FOOTER_PATH || './footer.md',
  themesDir: process.env.THEMES_DIR || './themes',
  authToken: process.env.AUTH_TOKEN || null,
  authCookieDays: parseInt(process.env.AUTH_COOKIE_DAYS || '30', 10),
  faviconTtlDays: parseInt(process.env.FAVICON_TTL_DAYS || '7', 10),
};

export { config };
