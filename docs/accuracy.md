# Accuracy Engine

Milens uses type bindings, method resolution order (MRO), and language-specific import semantics to maximize symbol resolution accuracy.

## Type Bindings

When a variable is assigned the result of a constructor or factory, milens infers its type and uses it for method resolution:

```typescript
const db = new Database()   // typeBinding: db → Database
db.query(...)               // resolver: lookup Database.query()
```

Supported patterns across 8 languages:

| Language | Pattern | Example |
|----------|---------|---------|
| TypeScript/JS | `const x = new Class()` | `const svc = new UserService()` |
| TypeScript/JS | `const x: Type = ...` | `const user: User = getUser()` |
| Python | `x = Class()` | `db = Database()` |
| Python | `x: Type = ...` | `repo: UserRepo = get_repo()` |
| Go | `x := NewType()` | `svc := NewUserService()` |
| Ruby | `x = Class.new` | `repo = UserRepo.new` |
| Ruby | `@x = Class.new` | `@cache = Cache.new` |
| Java | `Type x = new Type()` | `UserService svc = new UserService()` |
| Rust | `let x = Type::new()` | `let db = Database::new()` |
| PHP | `$x = new Class()` | `$repo = new UserRepo()` |

## Method Resolution Order (MRO)

When a method is called on a typed variable and the class uses inheritance, milens walks the MRO chain to find the correct implementation:

```
class C extends A, B   →   C3 order: C → A → B → Base
c.save()               →   finds A.save() (C3 linearization)
```

| Strategy | Languages | Algorithm |
|----------|-----------|-----------|
| **c3** | Python | C3 linearization (diamond-safe) |
| **first-wins** | TypeScript, Java, PHP | First declared parent wins |
| **ruby-mixin** | Ruby | include/extend/prepend order |
| **none** | Go, Rust | No inheritance — proximity-based fallback |

### C3 Linearization Example (Diamond)

```
    Base
   /    \
  A      B
   \    /
     C

C → A → B → Base
```

When `c.save()` is called on a variable of type C, milens walks `C → A → B → Base` and finds `A.save()` first (A is before B in C3 order).

## Import Semantics

How imported symbols are exposed to the importing file:

| Semantics | Languages | Behavior |
|-----------|-----------|----------|
| **named** | TypeScript, Python, Java, Rust, PHP | Only explicitly imported names are visible |
| **wildcard-leaf** | Ruby | `require './file'` exposes ALL top-level symbols |
| **wildcard-transitive** | Go | `import "./pkg"` exposes symbols from the package AND its re-exports |

## Accuracy Fixtures

8 test projects validate precision/recall:

| Project | Symbols | Links | minPrecision | minRecall |
|---------|:------:|:-----:|:----------:|:---------:|
| ts-project | ~40 | ~20 | 0.9 | 0.9 |
| py-project | ~30 | ~30 | 0.9 | 0.9 |
| go-project | ~25 | ~15 | 0.9 | 0.9 |
| rust-project | ~20 | ~15 | 0.9 | 0.9 |
| js-project | ~35 | ~25 | 0.9 | 0.9 |
| java-project | ~25 | ~20 | 0.9 | 0.9 |
| php-project | ~20 | ~15 | 0.9 | 0.9 |
| ruby-project | ~30 | ~25 | 0.3 | 0.8 |

Run: `npm test -- test/unit/accuracy.test.ts`

## Dual-Path Resolution

Milens uses two resolvers and compares outputs:

```
analyze()
  ├── Legacy resolver (resolveLinksWithStats)   ← proximity-based
  ├── Scope resolver (resolveWithScopes)        ← scope-graph-based
  └── diffResolutions() → checkParity()         ← match rate logging
```

Both produce links; the legacy resolver's results are used as the primary output. The scope resolver's results are compared for parity checking (target ≥ 99% match rate).
