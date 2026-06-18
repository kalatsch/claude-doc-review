# screens-admin editor — split engine

Recursive binary split tree. Each node is a `SplitNode { axis, ratio, a, b }` or a
`LeafBlock`. Snap ratios to powers of two (1/2..1/32); Alt disables snap. Merge on
leaf delete: sibling absorbs the freed region. Coordinates are % of parent block.
Граница двигается через snap к долям; каждый SplitNode хранит ratio.

## Persistence

Layout in localStorage (`screens-admin:v1`), media blobs in IndexedDB. No backend.

## Risks

Re-anchoring drift if the block id scheme changes mid-session.

## Словарь

- **SplitNode** — узел дерева раскладки: ось, доля и две дочерние области.
- **snap** — привязка границы блока к долям степени двойки (1/2…1/32).

<details>
<summary>Детали алгоритма merge</summary>

При удалении листа соседний узел заменяет родительский `SplitNode`, наследуя его
прямоугольник; доли пересчитываются от родителя.

</details>
