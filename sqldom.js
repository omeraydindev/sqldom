function execSql(sql, options) {
    const sqlParser = new NodeSQLParser.Parser();
    const {ast} = sqlParser.parse(sql);

    return Array.isArray(ast)
        ? ast.map(evalAst)
        : evalAst(ast);

    function evalAst(ast) {
        const {type, where, set} = ast;

        const supportedTypes = ['insert', 'select', 'update', 'delete'];
        if (!supportedTypes.includes(type)) {
            throw new Error('Unsupported query type: ' + type);
        }

        let elements = [];
        if (type === 'insert') {
            const {table, columns, values} = ast;
            const tagName = table[0].table;

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

                    value.map(v => evalOperand(element, v)).forEach((attr, index) => {
                        element.setAttribute(columns[index], attr);
                    });
                });
            }
        } else {
            const selector = buildCssSelector(ast);

            elements = [...document.querySelectorAll(selector)];
            if (where) {
                elements = elements.filter(element => evalWhere(element, where));
            }

            if (type === 'select') {
                // nothing
            } else if (type === 'update') {
                elements.forEach(element => {
                    set.forEach(({column, value}) => {
                        element.setAttribute(column, evalOperand(element, value));
                    });
                });
            } else if (type === 'delete') {
                elements.forEach(element => element.remove());
            }
        }

        return {elements};
    }

    function buildCssSelector(ast) {
        let tables;
        if (ast.type === 'select') {
            tables = ast.from;
        } else if (ast.type === 'update' || ast.type === 'delete') {
            tables = ast.table;
        }

        // If any of the tables is "dom", select all elements
        return tables.some(t => /dom/i.test(t.table))
            ? '*'
            : tables.map(t => t.table).join(',');
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
        const {left, right, operator, expr} = where;

        const _evalOperand = (operand) => evalOperand(element, operand);

        switch (operator) {
            case 'NOT':
                return !evalWhere(element, expr);
            case 'OR':
                return evalWhere(element, left) || evalWhere(element, right);
            case 'AND':
                return evalWhere(element, left) && evalWhere(element, right);
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
                    new RegExp('^' + like.replace(/%/g, '.*').replace(/_/g, '.') + '$');

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
            case undefined:
                // select * from dom where 1
                return !!_evalOperand(where);
        }

        throw new Error('Unsupported operator: ' + operator);
    }
}
