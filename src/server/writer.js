/**
 * Markdown write-back for HomepageMD.
 *
 * Functions to modify bookmark Markdown files programmatically.
 * Planned for v0.3 — interfaces defined here for architectural clarity.
 */

/**
 * Add a bookmark to a Markdown file under the specified category and subcategory.
 *
 * @param {string} filePath - Absolute path to the .md file
 * @param {object} bookmark - { title, url, description?, icon?, category, subcategory? }
 * @returns {Promise<void>}
 */
export async function addBookmark(filePath, bookmark) {
  throw new Error('Not implemented — planned for v0.3');
}

/**
 * Remove a bookmark from a Markdown file by URL.
 *
 * @param {string} filePath - Absolute path to the .md file
 * @param {string} url - The bookmark URL to remove
 * @returns {Promise<void>}
 */
export async function removeBookmark(filePath, url) {
  throw new Error('Not implemented — planned for v0.3');
}

/**
 * Update a bookmark's properties in a Markdown file.
 *
 * @param {string} filePath - Absolute path to the .md file
 * @param {string} url - The current bookmark URL (used as identifier)
 * @param {object} updates - { title?, url?, description?, icon?, category?, subcategory? }
 * @returns {Promise<void>}
 */
export async function updateBookmark(filePath, url, updates) {
  throw new Error('Not implemented — planned for v0.3');
}
