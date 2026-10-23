"""Parser for Zephra source code."""

from __future__ import annotations

from typing import List, Optional

from .ast import *
from .errors import ParseError
from .token import Token, TokenType


class Parser:
    def __init__(self, tokens: List[Token], recover: bool = False) -> None:
        self.tokens = tokens
        self.current = 0
        self.recover = recover

    def parse(self) -> Program:
        statements: List[Node] = []
        while not self._is_at_end():
            if self.recover:
                try:
                    statements.append(self._declaration())
                except ParseError as error:
                    self._synchronize()
                    # Cannot reliably recover a statement; skip
                    continue
            else:
                statements.append(self._declaration())
        return Program(statements)

    def _declaration(self) -> Node:
        if self._match(TokenType.LET):
            return self._var_declaration()
        if self._match(TokenType.FN):
            return self._function("function")
        return self._statement()

    def _var_declaration(self) -> VarDecl:
        name = self._consume(TokenType.IDENTIFIER, "Expect variable name.")
        initializer: Optional[Node] = None
        if self._match(TokenType.EQUAL):
            initializer = self._expression()
        self._consume(TokenType.SEMICOLON, "Expect ';' after variable declaration.")
        return VarDecl(name.lexeme, initializer)

    def _function(self, kind: str) -> FunDecl:
        name = self._consume(TokenType.IDENTIFIER, f"Expect {kind} name.")
        self._consume(TokenType.LEFT_PAREN, f"Expect '(' after {kind} name.")
        parameters: List[str] = []
        if not self._check(TokenType.RIGHT_PAREN):
            while True:
                if len(parameters) >= 255:
                    self._error(self._peek(), "Can't have more than 255 parameters.")
                param = self._consume(TokenType.IDENTIFIER, "Expect parameter name.")
                parameters.append(param.lexeme)
                if not self._match(TokenType.COMMA):
                    break
        self._consume(TokenType.RIGHT_PAREN, "Expect ')' after parameters.")
        self._consume(TokenType.LEFT_BRACE, f"Expect '{{' before {kind} body.")
        body = self._block()
        return FunDecl(name.lexeme, parameters, body)

    def _statement(self) -> Node:
        if self._match(TokenType.IMPORT):
            return self._import_statement()
        if self._match(TokenType.IF):
            return self._if_statement()
        if self._match(TokenType.WHILE):
            return self._while_statement()
        if self._match(TokenType.FOR):
            return self._for_statement()
        if self._match(TokenType.RETURN):
            return self._return_statement()
        if self._match(TokenType.BREAK):
            self._consume(TokenType.SEMICOLON, "Expect ';' after break.")
            return BreakStmt()
        if self._match(TokenType.CONTINUE):
            self._consume(TokenType.SEMICOLON, "Expect ';' after continue.")
            return ContinueStmt()
        if self._match(TokenType.LEFT_BRACE):
            return BlockStmt(self._block())
        return self._expression_statement()

    def _import_statement(self) -> ImportStmt:
        # Simple import syntax: import "file.zph";
        if self._match(TokenType.STRING):
            module_name = self._previous().literal
        elif self._match(TokenType.IDENTIFIER):
            module_name = self._previous().lexeme
        else:
            raise self._error(self._peek(), "Expect module name or string literal after 'import'.")
        self._consume(TokenType.SEMICOLON, "Expect ';' after import statement.")
        return ImportStmt(module_name)

    def _if_statement(self) -> IfStmt:
        self._consume(TokenType.LEFT_PAREN, "Expect '(' after 'if'.")
        condition = self._expression()
        self._consume(TokenType.RIGHT_PAREN, "Expect ')' after if condition.")
        self._consume(TokenType.LEFT_BRACE, "Expect '{' after if condition.")
        then_branch = self._block()
        else_branch: Optional[List[Node]] = None
        if self._match(TokenType.ELSE):
            self._consume(TokenType.LEFT_BRACE, "Expect '{' after 'else'.")
            else_branch = self._block()
        return IfStmt(condition, then_branch, else_branch)

    def _while_statement(self) -> WhileStmt:
        self._consume(TokenType.LEFT_PAREN, "Expect '(' after 'while'.")
        condition = self._expression()
        self._consume(TokenType.RIGHT_PAREN, "Expect ')' after condition.")
        self._consume(TokenType.LEFT_BRACE, "Expect '{' after while condition.")
        body = self._block()
        return WhileStmt(condition, body)

    def _for_statement(self) -> ForStmt:
        self._consume(TokenType.LEFT_PAREN, "Expect '(' after 'for'.")
        initializer: Optional[Node] = None
        if self._match(TokenType.SEMICOLON):
            initializer = None
        elif self._match(TokenType.LET):
            initializer = self._var_declaration()
        else:
            initializer = self._expression_statement()
        condition: Optional[Node] = None
        if not self._check(TokenType.SEMICOLON):
            condition = self._expression()
        self._consume(TokenType.SEMICOLON, "Expect ';' after loop condition.")

        increment: Optional[Node] = None
        if not self._check(TokenType.RIGHT_PAREN):
            increment = self._expression()
        self._consume(TokenType.RIGHT_PAREN, "Expect ')' after for clauses.")

        self._consume(TokenType.LEFT_BRACE, "Expect '{' after for clauses.")
        body = self._block()
        return ForStmt(initializer, condition, increment, body)

    def _return_statement(self) -> ReturnStmt:
        value: Optional[Node] = None
        if not self._check(TokenType.SEMICOLON):
            value = self._expression()
        self._consume(TokenType.SEMICOLON, "Expect ';' after return value.")
        return ReturnStmt(value)

    def _block(self) -> List[Node]:
        statements: List[Node] = []
        while not self._check(TokenType.RIGHT_BRACE) and not self._is_at_end():
            statements.append(self._declaration())
        self._consume(TokenType.RIGHT_BRACE, "Expect '}' after block.")
        return statements

    def _expression_statement(self) -> ExprStmt:
        expr = self._expression()
        self._consume(TokenType.SEMICOLON, "Expect ';' after expression.")
        return ExprStmt(expr)

    def _expression(self) -> Node:
        return self._assignment()

    def _assignment(self) -> Node:
        expr = self._or()
        if self._match(TokenType.EQUAL):
            equals = self._previous()
            value = self._assignment()
            if isinstance(expr, Variable):
                name = expr.name
                return Assign(name, value)
            raise self._error(equals, "Invalid assignment target.")
        return expr

    def _or(self) -> Node:
        expr = self._and()
        while self._match(TokenType.OR):
            operator = self._previous().lexeme
            right = self._and()
            expr = Logical(expr, operator, right)
        return expr

    def _and(self) -> Node:
        expr = self._equality()
        while self._match(TokenType.AND):
            operator = self._previous().lexeme
            right = self._equality()
            expr = Logical(expr, operator, right)
        return expr

    def _equality(self) -> Node:
        expr = self._comparison()
        while self._match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL):
            operator = self._previous().lexeme
            right = self._comparison()
            expr = Binary(expr, operator, right)
        return expr

    def _comparison(self) -> Node:
        expr = self._term()
        while self._match(TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.LESS, TokenType.LESS_EQUAL):
            operator = self._previous().lexeme
            right = self._term()
            expr = Binary(expr, operator, right)
        return expr

    def _term(self) -> Node:
        expr = self._factor()
        while self._match(TokenType.MINUS, TokenType.PLUS):
            operator = self._previous().lexeme
            right = self._factor()
            expr = Binary(expr, operator, right)
        return expr

    def _factor(self) -> Node:
        expr = self._unary()
        while self._match(TokenType.SLASH, TokenType.STAR, TokenType.PERCENT):
            operator = self._previous().lexeme
            right = self._unary()
            expr = Binary(expr, operator, right)
        return expr

    def _unary(self) -> Node:
        if self._match(TokenType.BANG, TokenType.MINUS):
            operator = self._previous().lexeme
            right = self._unary()
            return Unary(operator, right)
        return self._call()

    def _call(self) -> Node:
        expr = self._primary()
        while True:
            if self._match(TokenType.LEFT_PAREN):
                expr = self._finish_call(expr)
            elif self._match(TokenType.DOT):
                name = self._consume(TokenType.IDENTIFIER, "Expect property name after '.'.")
                expr = Get(expr, name.lexeme)
            else:
                break
        return expr

    def _finish_call(self, callee: Node) -> Node:
        arguments: List[Node] = []
        if not self._check(TokenType.RIGHT_PAREN):
            while True:
                if len(arguments) >= 255:
                    self._error(self._peek(), "Can't have more than 255 arguments.")
                arguments.append(self._expression())
                if not self._match(TokenType.COMMA):
                    break
        paren = self._consume(TokenType.RIGHT_PAREN, "Expect ')' after arguments.")
        return Call(callee, arguments)

    def _primary(self) -> Node:
        if self._match(TokenType.FALSE):
            return Literal(False)
        if self._match(TokenType.TRUE):
            return Literal(True)
        if self._match(TokenType.NULL):
            return Literal(None)
        if self._match(TokenType.NUMBER):
            return Literal(self._previous().literal)
        if self._match(TokenType.STRING):
            return Literal(self._previous().literal)
        if self._match(TokenType.IDENTIFIER):
            return Variable(self._previous().lexeme)
        if self._match(TokenType.LEFT_PAREN):
            expr = self._expression()
            self._consume(TokenType.RIGHT_PAREN, "Expect ')' after expression.")
            return Grouping(expr)
        raise self._error(self._peek(), "Expect expression.")

    def _match(self, *types: TokenType) -> bool:
        for t in types:
            if self._check(t):
                self._advance()
                return True
        return False

    def _consume(self, type: TokenType, message: str) -> Token:
        if self._check(type):
            return self._advance()
        raise self._error(self._peek(), message)

    def _check(self, type: TokenType) -> bool:
        if self._is_at_end():
            return False
        return self._peek().type == type

    def _advance(self) -> Token:
        if not self._is_at_end():
            self.current += 1
        return self._previous()

    def _is_at_end(self) -> bool:
        return self._peek().type == TokenType.EOF

    def _peek(self) -> Token:
        return self.tokens[self.current]

    def _previous(self) -> Token:
        return self.tokens[self.current - 1]

    def _error(self, token: Token, message: str) -> ParseError:
        if token.type == TokenType.EOF:
            return ParseError(message + " at end.", token.line, token.column)
        return ParseError(message, token.line, token.column)

    def _synchronize(self) -> None:
        self._advance()
        while not self._is_at_end():
            if self._previous().type == TokenType.SEMICOLON:
                return
            if self._peek().type in (
                TokenType.FN,
                TokenType.LET,
                TokenType.FOR,
                TokenType.IF,
                TokenType.WHILE,
                TokenType.RETURN,
            ):
                return
            self._advance()
