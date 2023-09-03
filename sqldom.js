function execSql(sql, options) {
    const sqlParser = new NodeSQLParser.Parser();
    const {ast} = sqlParser.parse(sql);

    return Array.isArray(ast)
        ? ast.map(evalAst)
        : evalAst(ast);

    function evalAst(ast) {
        const elements = (() => {
            switch (ast.type) {
                case 'insert':
                    return evalInsertStatement(ast);
                case 'select':
                    return evalSelectStatement(ast);
                case 'update':
                    return evalUpdateStatement(ast);
                case 'delete':
                    return evalDeleteStatement(ast);
                default:
                    throw new Error('Unsupported query type: ' + ast.type);
            }
        })();

        return {elements};
    }

    function evalInsertStatement(ast) {
        const {set, columns, values} = ast;
        const tables = getTablesFromAst(ast);
        const tagName = tables[0].table;

        const elements = [];

        if (!options?.insertTo) {
            throw new Error('An insert root must be provided for an INSERT query');
        }

        if (set) {
            const element = document.createElement(tagName);
            options.insertTo.appendChild(element);
            elements.push(element);

            set.forEach(({column, value}) => {
                element.setAttribute(column, evalOperand(element, value));
            });
        } else if (columns && values) {
            values.forEach(({value}) => {
                const element = document.createElement(tagName);
                options.insertTo.appendChild(element);
                elements.push(element);

                columns.forEach((column, index) => {
                    element.setAttribute(column, evalOperand(element, value[index]));
                });
            });
        }

        return elements;
    }

    function evalSelectStatement(ast) {
        const {where, columns} = ast;
        const tables = getTablesFromAst(ast);
        const usedTables = tables?.length > 0;

        let elements;
        if (usedTables) {
            elements = selectElements(tables, where);
        }

        if (columns.some(c => c.expr.column === '*')) {
            if (!usedTables) {
                throw new Error('No tables used');
            }

            return elements;
        }

        elements ||= [{}];
        const matches = new Array(elements.length).fill(0).map(_ => ({}));

        elements.forEach((element, index) => {
            columns.forEach(({as, expr}) => {
                const columnName = as ?? sqlParser.exprToSQL(expr);
                matches[index][columnName] = evalOperand(element, expr);
            });
        });

        return matches;
    }

    function evalUpdateStatement(ast) {
        const {set, where} = ast;
        const tables = getTablesFromAst(ast);
        const elements = selectElements(tables, where);

        elements.forEach(element => {
            set.forEach(({column, value}) => {
                element.setAttribute(column, evalOperand(element, value));
            });
        });

        return elements;
    }

    function evalDeleteStatement(ast) {
        const {where} = ast;
        const tables = getTablesFromAst(ast);
        const elements = selectElements(tables, where);

        elements.forEach(element => element.remove());

        return elements;
    }

    /**
     * @returns {Array<{table: string}>}
     */
    function getTablesFromAst(ast) {
        if (ast.type === 'select') {
            return ast.from;
        } else if (ast.type === 'update' || ast.type === 'delete' || ast.type === 'insert') {
            return ast.table;
        }

        throw new Error('Unsupported query type: ' + ast.type);
    }

    /** @returns {string} */
    function buildCssSelector(tables) {
        // If any of the tables is "dom", select all elements
        return tables.some(t => /dom/i.test(t.table))
            ? '*'
            : tables.map(t => t.table).join(',');
    }

    function selectElements(tables, where) {
        const selector = buildCssSelector(tables);

        let elements = [...document.querySelectorAll(selector)];
        if (where) {
            elements = elements.filter(element => evalWhere(element, where));
        }

        return elements;
    }

    function evalOperand(element, operand) {
        const refTypes = ['column_ref'];
        const valueTypes = ['single_quote_string', 'string', 'number', 'bool', 'null'];

        if (refTypes.includes(operand.type)) {
            return element.getAttribute(operand.column);
        } else if (valueTypes.includes(operand.type)) {
            return operand.value;
        } else if (operand.type === 'function') {
            return evalFunction(element, operand);
        } else if (operand.type === 'binary_expr') {
            return evalBinaryExpr(element, operand);
        }

        throw new Error('Unsupported operand: ' + JSON.stringify(operand));
    }

    function evalFunction(element, operand) {
        const args = operand.args.value;

        const _evalOperand = (operand) => evalOperand(element, operand);

        switch (operand.name.toLowerCase()) {
            case 'length':
                return _evalOperand(args[0])?.toString().length ?? 0;
            case 'concat':
                return args.map(_evalOperand).join('');
            case 'concat_ws':
                const params = args.map(_evalOperand);
                return params.slice(1).join(params[0]);
        }

        throw new Error('Unsupported function: ' + JSON.stringify(operand));
    }

    function evalWhere(element, where) {
        const {operator} = where;

        switch (operator) {
            case undefined:
                // select * from dom where 1
                return !!evalOperand(element, where);
            default:
                return evalBinaryExpr(element, where);
        }
    }

    function evalBinaryExpr(element, operand) {
        const {left, right, operator} = operand;

        const _evalOperand = (operand) => evalOperand(element, operand);

        switch (operator) {
            case 'NOT':
                return !evalWhere(element, expr);
            case 'OR':
            case '||':
                return evalWhere(element, left) || evalWhere(element, right);
            case 'AND':
            case '&&':
                return evalWhere(element, left) && evalWhere(element, right);
            case 'XOR':
                return evalWhere(element, left) !== evalWhere(element, right);
            case '+':
                return _evalOperand(left) + _evalOperand(right);
            case '-':
                return _evalOperand(left) - _evalOperand(right);
            case '*':
                return _evalOperand(left) * _evalOperand(right);
            case '/':
                return _evalOperand(left) / _evalOperand(right);
            case '%':
                return _evalOperand(left) % _evalOperand(right);
            case '=':
                return _evalOperand(left) === _evalOperand(right);
            case '!=':
            case '<>':
                return _evalOperand(left) !== _evalOperand(right);
            case 'IS':
                return _evalOperand(left) === _evalOperand(right);
            case 'IS NOT':
                return _evalOperand(left) !== _evalOperand(right);
            case '<':
                return _evalOperand(left) < _evalOperand(right);
            case '<=':
                return _evalOperand(left) <= _evalOperand(right);
            case '>':
                return _evalOperand(left) > _evalOperand(right);
            case '>=':
                return _evalOperand(left) >= _evalOperand(right);
            case 'LIKE':
            case 'NOT LIKE': {
                const lhs = _evalOperand(left);
                const rhs = _evalOperand(right);
                const likeToRegex = (like) =>
                    new RegExp('^' +
                        like.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                            .replace(/%/g, '.*').replace(/_/g, '.') + '$');

                const result = likeToRegex(rhs).test(lhs);
                const negate = operator.startsWith('NOT');

                return negate ? !result : result;
            }
            case 'RLIKE':
            case 'NOT RLIKE': {
                const lhs = _evalOperand(left);
                const rhs = _evalOperand(right);

                const result = new RegExp(rhs).test(lhs);
                const negate = operator.startsWith('NOT');

                return negate ? !result : result;
            }
            case 'IN':
            case 'NOT IN':
            case 'BETWEEN':
            case 'NOT BETWEEN': {
                if (left.type === 'expr_list') {
                    throw new Error(`Left hand side cannot be a list in an ${operator} condition`);
                }
                if (right.type !== 'expr_list') {
                    throw new Error(`Right hand side has to be a list in an ${operator} condition`);
                }

                const lhs = _evalOperand(left);
                const rhs = right.value.map(_evalOperand);
                const negate = operator.startsWith('NOT');

                if (operator === 'IN' || operator === 'NOT IN') {
                    const result = rhs.includes(lhs);
                    return negate ? !result : result;
                } else if (operator === 'BETWEEN' || operator === 'NOT BETWEEN') {
                    const result = lhs >= rhs[0] && lhs <= rhs[1];
                    return negate ? !result : result;
                } else {
                    throw new Error('Unsupported operator: ' + operator);
                }
            }
        }

        throw new Error('Unsupported operator: ' + operator);
    }
}
