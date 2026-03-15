# Malformed Test File

This is just a paragraph and should be ignored.

##

### Orphan subcategory without a category

- [No Category Bookmark](https://example.com)

## Valid Category

Regular text interspersed.

- Not a bookmark, just a list item

- [Valid Bookmark](https://example.com)
  - description: This one is fine
  - unknown: this metadata key should be ignored
  - icon: https://example.com/icon.png

#### Heading level 4 should be ignored

- [Another Valid Bookmark](https://example.com/another)

- [](https://example.com/no-title)

- [No URL]()

Some trailing text.
