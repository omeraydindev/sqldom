# sqldom

A fun library for querying and manipulating DOM elements using a subset of (My)SQL.

## Installation
### From CDN
```html
<script src="https://cdn.jsdelivr.net/npm/sqldom/dist/sqldom.min.js"></script>
<script>
    const {execSql} = window.sqldom;
    // ...
</script>
```

### From NPM
```bash
npm install sqldom
```

## Usage
### Select
Using the table `dom` has the effect of selecting all elements from the DOM, while using a specific tag name like `button` will only select elements of that tag name.

Columns are the properties of the element, e.g `id`, `class`,`value` etc. You can use `*` to select the DOM element itself.

```js
const {elements} = execSql(`SELECT * FROM dom WHERE class LIKE "%foo%"`);
// `elements` is an array of DOM elements
```

```js
const {elements} = execSql(`SELECT id, type FROM button WHERE text = "Click me"`);
// `elements` is an array of objects, each object containing the id and type of a button
```

### Update
```js
execSql(`UPDATE div SET class = CONCAT_WS(" ", class, "foo") WHERE id = "bar"`);
```

### Insert
You must provide a container element to insert into as the second argument.
```js
execSql(`INSERT INTO div (id, class) VALUES ("foo", "bar")`, {
    insertTo: container,
});
```
You could even go one step further and select the container element using a query as well:
```js
const {elements} = execSql(`SELECT * FROM div WHERE id = "container"`);
const container = elements[0];

execSql(`INSERT INTO div SET id = "foo", class = "bar"`, {
    insertTo: container,
});
```

### Delete
```js
execSql(`DELETE FROM div WHERE class = "foo" LIMIT 1`);
```

## Motivation
I was basically [nerd-sniped](https://en.wikipedia.org/wiki/Nerd_sniping) by [this tweet](https://twitter.com/erikras/status/1696191464529678356) and decided I would give it a shot despite it being pointless (for obvious reasons). Spent the better half of my weekend on it and had a lot of fun.

For that reason it's not exactly the most efficient, it essentially pulls all[^1] elements from the DOM and filters them out according to the conditions in the query. At first, I thought of transforming parts of the WHERE clause of the query into [CSS selectors](https://www.w3.org/TR/selectors-4/) to try and narrow down the results a bit, but then figured it was kinda pointless lol. I might still do it later.

It uses [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) to parse the SQL. Only supports basic `SELECT`, `INSERT`, `UPDATE`, `DELETE` statements (i.e no joins or subqueries or group by etc) _for now_.

[^1]: It will pull all elements if you do a `SELECT * FROM dom`. If you do a `SELECT * FROM input` for example, it will only pull inputs.

## Features
- [x] Basic CRUD (SELECT, UPDATE, INSERT, DELETE)
- [x] Binary operators, comparison operators, logical operators etc.
- [x] Some functions such as `CONCAT_WS`,`CONCAT`,`LENGTH` (more to be added)
- [x] WHERE
- [x] ORDER BY
- [x] LIMIT
- [ ] Subqueries
- [ ] Joins
- [ ] Group by
- [ ] Aggregate functions
- [ ] More validations to be MySQL compliant

## License
MIT License