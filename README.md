# SmartPrep AI

**AI-powered food intelligence for your kitchen.**

SmartPrep AI is a mobile application that helps users understand what food they already have, decide what to cook, manage groceries, track nutrition, and reduce food waste.

Instead of treating meal planning, grocery shopping, calorie tracking, and pantry management as separate workflows, SmartPrep connects them into one system — so actions in one part of the kitchen automatically affect the rest.

---

## Overview

Most food apps answer only one question:

* *What should I cook?*
* *How many calories did I eat?*
* *What do I need to buy?*
* *What is in my pantry?*

SmartPrep is designed around the full food lifecycle:

```text
Scan / Import
      ↓
    Pantry
      ↓
Recipe Discovery
      ↓
 Meal Planning
      ↓
 Grocery List
      ↓
   Shopping
      ↓
Pantry Restock
      ↓
    Cooking
      ↓
Nutrition + Inventory Updates
```

The goal is to build a kitchen assistant that understands the relationship between **inventory, meals, groceries, nutrition, and waste** instead of tracking each independently.

---

## Core Features

### Pantry Management

Users can maintain a structured digital inventory of the food they currently have.

SmartPrep tracks information such as:

* ingredient
* quantity
* unit
* expiration date
* category
* nutrition information
* inventory state

The pantry is designed to act as the central source of truth for the rest of the application.

---

### Ingredient Scanning

SmartPrep is being built to use computer vision to identify ingredients from photos and turn them into structured pantry data.

The vision pipeline is designed around real-world uncertainty rather than assuming every prediction is correct.

Low-confidence predictions can be reviewed or corrected by the user before inventory changes are committed.

---

### Recipe Discovery

Recipe recommendations can use a user's existing pantry inventory to surface meals they can realistically make.

Recommendations can consider:

* available ingredients
* missing ingredients
* dietary preferences
* nutrition goals
* pantry utilization
* food expiration
* user preferences

The long-term goal is to optimize not only for *what sounds good*, but also for **what makes sense given the user's kitchen**.

---

### Meal Planning

Users can organize recipes into future meals while keeping pantry and grocery information connected.

Meal planning is designed to answer questions such as:

> What can I make with what I already own?

> What ingredients am I missing?

> What should I buy this week?

> Which ingredients should I use before they expire?

---

### Grocery Management

SmartPrep supports a grocery lifecycle rather than treating a grocery list as static text.

Items can move through states such as:

```text
Needed → Planned → Purchased → Transferred to Pantry
```

Purchased groceries can be transferred directly into pantry inventory through backend workflows instead of requiring users to manually re-enter the same information.

Shopping history is retained so future recommendation systems can learn from actual behavior.

---

### Cooking Mode

Recipes connect directly to pantry inventory.

When a user finishes cooking, SmartPrep determines how ingredients should affect existing inventory.

The deduction system distinguishes between:

* required quantity
* available quantity
* deducted quantity
* uncovered quantity

If the pantry does not contain enough of an ingredient, SmartPrep does **not** silently pretend the recipe was fully covered.

Instead, the user must explicitly decide how the mismatch should be handled.

This prevents pantry data from becoming progressively inaccurate after repeated cooking sessions.

---

### Nutrition & Goals

SmartPrep combines kitchen inventory with nutrition tracking.

Users can work toward goals involving:

* calories
* protein
* carbohydrates
* fat
* weight management
* meal-level nutrition
* daily and historical intake

Nutrition data is normalized so ingredients, recipes, prepared meals, and logged meals can share a consistent model.

---

### Prepared Meals

Cooked recipes can become prepared meals instead of disappearing after a cooking session.

This allows SmartPrep to model leftovers and future servings while preserving the relationship between:

```text
Raw Ingredients → Recipe → Prepared Meal → Consumed Meal
```

---

### Email Grocery Intelligence

SmartPrep can process supported grocery-related emails and convert useful information into structured signals.

The backend includes:

* Gmail synchronization
* deterministic email classification
* AI fallback classification
* structured email signals
* protected connection storage
* encrypted authentication tokens

Sensitive tokens are protected using **AES-GCM encryption**, while database access is restricted through **Row Level Security**.

---

## Intelligent Kitchen Model

A core design principle behind SmartPrep is that food data should not live in isolated features.

For example:

```text
Buying groceries
        ↓
Updates pantry inventory
        ↓
Changes available recipes
        ↓
Changes grocery recommendations
        ↓
Influences meal plans
        ↓
Cooking deducts inventory
        ↓
Nutrition logs update
```

This shared state creates the foundation for future personalized recommendations.

---

## Architecture

```text
┌───────────────────────────────┐
│        React Native App       │
│       Expo + TypeScript       │
└───────────────┬───────────────┘
                │
                │
                ▼
┌───────────────────────────────┐
│            Supabase           │
│                               │
│  PostgreSQL                   │
│  Authentication               │
│  Row Level Security           │
│  RPC Functions                │
│  Database Migrations          │
└───────────────┬───────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌───────────────┐ ┌───────────────┐
│ AI / ML Layer │ │ Integrations  │
│               │ │               │
│ Computer      │ │ Gmail         │
│ Vision        │ │ Nutrition     │
│ Classification│ │ Data Sources  │
│ Recommendations││               │
└───────────────┘ └───────────────┘
```

---

## Tech Stack

### Mobile

* React Native
* Expo
* TypeScript
* Expo Router

### Backend

* Supabase
* PostgreSQL
* SQL migrations
* Row Level Security
* PostgreSQL RPC functions

### AI / ML

* Computer vision ingredient classification
* AI-assisted classification
* Recommendation systems
* Nutrition normalization
* Confidence-aware prediction workflows

### Security

* Supabase Authentication
* Row Level Security policies
* AES-GCM token encryption
* server-controlled database workflows
* validation around sensitive mutations

### Testing

The project includes automated validation across application logic and backend behavior.

Current development includes:

* **864 passing tests**
* **61 test suites**
* static validation
* TypeScript type safety checks
* database/RPC tests
* pgTAP coverage for backend workflows

---

## Database

SmartPrep's backend is managed through version-controlled Supabase migrations.

The schema currently spans **15 migrations** covering areas including:

```text
Identity
   ↓
Pantry
   ↓
Recipes
   ↓
Meal Planning
   ↓
Cooking
   ↓
Prepared Meals
   ↓
Meal Logging
   ↓
Grocery Lifecycle
   ↓
Scan History
   ↓
Nutrition
   ↓
Email Intelligence
```

Database logic is intentionally used for operations where consistency matters, including inventory transitions and grocery-to-pantry transfers.

---

## Example: Grocery → Pantry

One example of SmartPrep's stateful architecture is the grocery transfer workflow.

Instead of:

```text
Mark grocery as purchased
→ manually create pantry item
→ manually copy quantity
→ manually remove grocery item
```

SmartPrep can perform the transition through a controlled backend operation:

```text
Purchased Grocery
        ↓
transfer_grocery_item_to_pantry()
        ↓
Pantry Inventory Updated
        ↓
Grocery Lifecycle Updated
        ↓
History Preserved
```

This reduces duplicated state and prevents partially completed transitions.

---

## Example: Safe Pantry Deduction

SmartPrep also avoids automatically hiding inventory inconsistencies.

Suppose a recipe requires:

```text
2 cups milk
```

but the pantry contains:

```text
1 cup milk
```

SmartPrep does not simply deduct the available cup and mark the requirement complete.

Instead:

```text
Required:   2 cups
Available:  1 cup
Shortfall:  1 cup

State → needs_decision
```

The user can then explicitly confirm a partial deduction, skip the deduction, or resolve the ingredient another way.

This keeps inventory data trustworthy over time.

---

## Project Structure

```text
SmartPrep/
│
├── app/                  # Expo Router screens
├── components/           # Shared UI components
├── features/             # Domain-specific application features
├── utils/                # Shared business logic
├── services/             # External/backend integrations
│
├── supabase/
│   ├── migrations/       # Version-controlled database schema
│   └── tests/            # Database / pgTAP tests
│
├── assets/               # Images, icons, and static resources
├── scripts/              # Development and data tooling
│
└── package.json
```

Exact structure may evolve as SmartPrep continues development.

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd <repository-name>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create the required local environment file and provide your Supabase configuration and any enabled integration credentials.

Do not commit secrets or production credentials to the repository.

### 4. Start the application

```bash
npx expo start
```

You can then launch SmartPrep using:

* an iOS simulator
* an Android emulator
* a development build
* a supported Expo environment

---

## Development Principles

SmartPrep is built around several engineering principles.

### Preserve user trust

The application should not silently make uncertain inventory decisions.

### Keep one source of truth

Pantry, grocery, recipe, cooking, and nutrition systems should share structured state rather than maintain disconnected copies.

### Make AI correctable

AI predictions should assist the user rather than override them.

### Prefer deterministic logic where possible

Rules and structured workflows handle predictable behavior. AI is reserved for tasks where probabilistic reasoning actually provides value.

### Design for future personalization

Actions such as cooking, correcting scans, adding groceries, and selecting recipes can eventually become signals for increasingly personalized recommendations.

---

## Roadmap

SmartPrep is continuing toward a more autonomous kitchen intelligence system.

Planned areas include:

* improved computer vision ingredient recognition
* quantity estimation from images
* personalized recipe ranking
* expiration-aware recommendations
* grocery purchase prediction
* pantry depletion forecasting
* food waste analytics
* adaptive nutrition recommendations
* user-feedback learning loops
* stronger first-party training datasets
* production deployment and monitoring

---

## Why SmartPrep?

The core idea behind SmartPrep is simple:

**Your pantry, grocery list, recipes, nutrition tracker, and meal planner should understand each other.**

Most applications optimize one step of the food experience.

SmartPrep is being designed to connect the entire loop.

```text
Know what you have.
Use what you have.
Buy what you need.
Track what you eat.
Waste less.
```

---

## Status

SmartPrep AI is currently under active development.

The project is being built as both a production-oriented application and an exploration of how **AI, computer vision, structured backend systems, nutrition data, and sustainability** can work together in a consumer product.

---

## Author

**My Pham**

Data Science @ University of Florida

[mypham.space](https://mypham.space)
