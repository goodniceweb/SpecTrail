# todo/ui/list Specification

## Purpose

The screen that shows the todo list.

## Requirements

### Requirement: Show open items first

The list screen SHALL show the open items above the done items.

<!-- screen: none -->

#### Scenario: Order of items

- **GIVEN** the done item "Buy milk" and the open item "Call Ann"
- **WHEN** the list screen opens
- **THEN** "Call Ann" is above "Buy milk"
