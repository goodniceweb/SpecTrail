# todo/items Specification

## Purpose

The rules for the items of a todo list.

## Requirements

### Requirement: Add an item

The app SHALL add an item with the text that the user types. The text SHALL NOT be empty.

#### Scenario: Add an item with text

- **GIVEN** an empty list
- **WHEN** the user adds the item "Buy milk"
- **THEN** the list has one item with the text "Buy milk"

#### Scenario: Refuse an empty item

- **GIVEN** an empty list
- **WHEN** the user adds an item with no text
- **THEN** the list stays empty

### Requirement: Complete an item

The app SHALL mark an item as done when the user checks it.

#### Scenario: Check an item

- **GIVEN** a list with the open item "Buy milk"
- **WHEN** the user checks the item
- **THEN** the item is done
