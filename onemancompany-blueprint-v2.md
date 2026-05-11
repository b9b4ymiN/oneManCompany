# onemancompany — Complete Project Blueprint v2.0
> เอกสารหลักของโปรเจค | ฉบับสมบูรณ์สำหรับทุกคนที่เกี่ยวข้องกับการพัฒนา

**Version:** 2.0  
**สถานะ:** Living Document — อัปเดตได้เมื่อ spec เปลี่ยน  
**เป้าหมาย:** ทุกคนที่อ่านเอกสารนี้จบสามารถเข้าใจว่าระบบนี้คืออะไร ทำงานอย่างไร และจะพัฒนาอย่างไร

---

## สารบัญ

```
Part 1  — Foundation: What & Why
Part 2  — System Architecture: Big Picture
Part 3  — Company Kernel: The Brain
Part 4  — Registry Layer: The Memory
Part 5  — Internal Message Protocol: The Language
Part 6  — Observability & Audit System: The Eyes
Part 7  — Decision Journal & Learning Loop: The Wisdom
Part 8  — Multi-Domain Architecture: The Flexibility
Part 9  — Runtime & Protocol Layer: The Interface
Part 10 — Technology Stack: The Tools
Part 11 — Use Case: Investment War Room
Part 12 — Development Methodology: How to Build
Part 13 — Phased Roadmap: When to Build What
Part 14 — Risk Register & Guardrails
Part 15 — Success Criteria
```

---

# PART 1: FOUNDATION

## 1.1 Executive Summary

**onemancompany** คือระบบจำลอง "บริษัทส่วนตัวที่ขับเคลื่อนด้วย AI agents"
ออกแบบให้คนหนึ่งคนสามารถมีทีมที่คิดได้จริง วิเคราะห์ได้จริง
และช่วยตัดสินใจได้จริง — โดยไม่ผูกกับ AI model ใดตัวหนึ่ง

ประโยคตกผลึก:

> onemancompany คือบริษัทจำลองของคนหนึ่งคน
> ที่ใช้ AI หลายตัวเป็นพนักงาน หลาย skill เป็นความสามารถ
> หลาย source เป็นหลักฐาน และหลาย protocol เป็นช่องทางทำงาน
> แต่มี Company Kernel เดียวเป็นแกนกลางของการคิด การตัดสินใจ และการเรียนรู้

**use case แรก:** Investment War Room — วิเคราะห์หุ้น ประเมินมูลค่า
ตรวจความเสี่ยง และแปลงข้อมูลเป็น investment decision ที่ใช้ได้จริง

**ไม่ใช่:** chatbot | web app | ระบบเรียก AI หลายตัวพร้อมกัน

---

## 1.2 Core Philosophy

### Company-first, Tool-second

เริ่มจากคำถามว่า "บริษัทนี้ควรทำงานอย่างไร" ไม่ใช่ "จะใช้ tool อะไร"

```
ถูกต้อง:
  Owner ต้องการผลลัพธ์
  → Company Kernel เข้าใจ mission
  → ตั้งทีม agent
  → เลือก model/source/tool ที่เหมาะกับแต่ละงาน
  → ให้ agent ทำงานร่วมกัน
  → สรุปเป็น decision

ไม่ถูกต้อง:
  Claude Code เป็นหัวหน้า
  → เรียก Gemini
  → เรียก Codex
  → เอาผลลัพธ์มารวม
```

### Agent ≠ Model

```
Agent = Role + Persona + Worldview + Skills + Tools + Interaction Rules + Output Contract

Model = engine ที่ agent ใช้คิด เปลี่ยนได้โดยไม่เปลี่ยน agent
```

### Kernel เป็น stable core, ทุกอย่างรอบนอกเปลี่ยนได้

```
เปลี่ยนได้:    Protocol | Model | Interface | Tool
ไม่เปลี่ยน:   Company Kernel | Operating Process | Evidence Standard
```

### Evidence-first

```
ทุก claim ต้องมีแหล่งที่มา
ทุก fact ต้องต่างจาก assumption
ทุก data gap ต้องบอกออกมา ไม่ใช่ถูกกลบ
```

### Observable by Default

```
ทุก agent call ต้องบันทึก
ทุก decision ต้องตรวจสอบย้อนหลังได้
ทุก error ต้องปรากฏชัด ไม่ใช่ silent fail
```

---

## 1.3 What onemancompany Does

เจ้าของถามโจทย์ใหญ่ เช่น:

```
"วิเคราะห์หุ้น MCS โดยสมมติกำไร Q1 ปี 2026 เป็นฐาน 400 ล้าน
 คิด conservative DCF และราคาที่ควรสนใจถ้าต้องการ MOS > 30%"
```

ระบบทำงานเหมือนบริษัทจริง:

```
1. รับ brief จากเจ้าของ
2. แปลงเป็น mission ที่ชัดเจน
3. ตั้งทีม agent ที่เหมาะสม
4. รวบรวมหลักฐาน (evidence pack)
5. ให้แต่ละ agent วิเคราะห์ในมุมของตน
6. ให้ agent ถามและ challenge กัน
7. ตรวจสอบหลักฐาน
8. สังเคราะห์คำตอบเดียว
9. แปลงเป็น decision + follow-up
10. บันทึก decision journal
```

ผลลัพธ์ไม่ใช่แค่ "ซื้อ/ขาย/ถือ" แต่เป็น **Investment Decision State**:

```
REJECT | WATCH | RESEARCH_MORE | WAIT_FOR_PRICE |
STARTER_POSITION | CORE_CANDIDATE | ADD_ON_WEAKNESS |
HOLD | TRIM | EXIT_THESIS_BROKEN
```

---

# PART 2: SYSTEM ARCHITECTURE

## 2.1 Architecture Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        OWNER                                     │
└─────────────────────┬───────────────────────────────────────────┘
                      │ คุย / สั่งงาน / รับผล
┌─────────────────────▼───────────────────────────────────────────┐
│                   INTERFACE LAYER                                │
│  Claude Code CLI │ Terminal CLI │ Future Web │ Future Mobile    │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                   COMPANY KERNEL                                 │
│                                                                  │
│  Mission Planner → Team Builder → Context Manager               │
│  Task Router → Debate Controller → Evidence Controller          │
│  Synthesis Engine → Constitution Enforcer → Human Gate          │
│  Decision Journal Writer                                         │
└──────┬──────────────┬──────────────┬───────────────────────────┘
       │              │              │
┌──────▼──────┐ ┌────▼──────┐ ┌────▼──────────────────────────┐
│   REGISTRY  │ │OBSERVABILITY│ │     RUNTIME ADAPTER LAYER    │
│   LAYER     │ │& AUDIT      │ │                              │
│             │ │SYSTEM       │ │ Claude │ Gemini │ Codex │ ZAI│
│ Agent Reg.  │ │             │ │ Python │ Local  │ Human │    │
│ Skill Reg.  │ │ Trace Log   │ │                              │
│ Source Reg. │ │ Mission Log │ └──────────────────────────────┘
│ Model Reg.  │ │ Audit Trail │
│ Tool Reg.   │ │ Validator   │
│ Domain Reg. │ │ Replay Sys. │
└─────────────┘ └────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                   PROTOCOL LAYER                                 │
│        CLI │ MCP │ A2A │ HTTP API │ File/Queue/Event            │
└─────────────────────────────────────────────────────────────────┘
```

## 2.2 Layer Responsibilities

| Layer | หน้าที่ | เปลี่ยนได้? |
|---|---|---|
| Interface | รับ input จากเจ้าของ แสดง output | ใช่ — เพิ่ม interface ใหม่ได้ |
| Company Kernel | logic หลักทั้งหมด | ไม่ — นี่คือ stable core |
| Registry | ฐานข้อมูล config ทุกอย่าง | ใช่ — เพิ่ม/แก้ได้ผ่าน YAML |
| Observability | บันทึกทุกอย่างที่เกิดขึ้น | ไม่ — ต้องทำงานตลอดเวลา |
| Runtime Adapter | เชื่อมกับ AI models จริง | ใช่ — เพิ่ม/เปลี่ยน backend ได้ |
| Protocol | วิธีที่ระบบ expose ตัวเอง | ใช่ — เพิ่ม protocol ใหม่ได้ |

---

# PART 3: COMPANY KERNEL

Company Kernel คือหัวใจของระบบ ทำงานเหมือนผู้บริหารบริษัท
ทุก logic สำคัญอยู่ที่นี่ — ไม่กระจายไปที่ agent หรือ adapter

## 3.1 Mission State Machine

### ทำไมต้องมี State Machine

ระบบที่ไม่มี formal state machine จะพังแบบ silent:
agent หนึ่งล้มเหลว → kernel ไม่รู้ว่าต้อง retry หรือ skip หรือ abort
→ synthesis เกิดขึ้นด้วยข้อมูลไม่ครบโดยไม่มีใครรู้

### Mission States

```
                    ┌─────────────────────────────┐
                    │           DRAFT              │
                    │  (owner พิมพ์ brief มา)      │
                    └──────────────┬──────────────┘
                                   │ validate input
                    ┌──────────────▼──────────────┐
                    │          PLANNING            │
                    │  kernel แตก task             │
                    │  เลือกทีม agent              │
                    │  กำหนด evidence requirement  │
                    └──────────────┬──────────────┘
                                   │ team ready
     ┌─────────────────────────────▼──────────────────────────┐
     │                       RESEARCHING                       │
     │  researcher agents ทำงาน                                │
     │  ดึงข้อมูลจาก official sources                          │
     │  สร้าง Evidence Pack                                    │
     └──────┬──────────────────────────────────┬──────────────┘
            │ evidence score ≥ threshold        │ evidence score < threshold
            │                                  ▼
            │                    ┌─────────────────────────┐
            │                    │    HUMAN_REVIEW (Gate 1) │
            │                    │  แจ้ง owner: ข้อมูลน้อย  │
            │                    │  รอ input ก่อน proceed   │
            │                    └────────────┬────────────┘
            │                                 │ owner approve / add data
            ▼                                 ▼
     ┌──────────────────────────────────────────────────────┐
     │                      ANALYZING                        │
     │  analyst agents ทำงาน parallel                        │
     │  แต่ละ agent อ่าน evidence pack                        │
     │  output individual analysis                           │
     └──────────────────────────┬───────────────────────────┘
                                 │ all agents done
            ┌────────────────────▼───────────────────────────┐
            │               HUMAN_REVIEW (Gate 2)             │
            │  optional: แสดง individual analyses             │
            │  owner อาจ add context ก่อน debate              │
            └──────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────▼──────────────────────────────┐
            │                    CROSS_QA                      │
            │  agents ถามคำถามข้ามกัน                          │
            │  researcher ตอบด้วย evidence                     │
            │  เก็บ unanswered questions                       │
            └──────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────▼──────────────────────────────┐
            │                   DEBATING                       │
            │  structured disagreement rounds (max 3)          │
            │  challenge ต้องมี evidence tier ระบุ             │
            │  unresolved → flag ไม่ใช่ suppress              │
            └──────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────▼──────────────────────────────┐
            │                  SYNTHESIZING                    │
            │  CIO รวม outputs ทั้งหมด                         │
            │  agreement points → confidence ↑                 │
            │  disagreement points → surface ให้ owner          │
            │  produce final analysis                          │
            └──────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────▼──────────────────────────────┐
            │               HUMAN_REVIEW (Gate 3)              │
            │  mandatory: owner อ่าน synthesis                 │
            │  อาจ request เพิ่ม / เปลี่ยน assumption          │
            └──────────────────┬──────────────────────────────┘
                               │ owner confirm
            ┌──────────────────▼──────────────────────────────┐
            │                   DECIDED                        │
            │  decision_state กำหนด                            │
            │  price_to_watch กำหนด                            │
            │  thesis_breaker กำหนด                            │
            │  follow_up กำหนด                                 │
            └──────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────▼──────────────────────────────┐
            │                  JOURNALED                       │
            │  เขียน decision journal entry                    │
            │  บันทึก assumptions และ open questions           │
            │  set follow-up reminders                         │
            └──────────────────────────────────────────────────┘

     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ERROR PATHS ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

     ทุก state สามารถ transition ไป FAILED ได้ถ้า:
     - timeout เกินที่กำหนด
     - adapter error ไม่สามารถ recover ได้
     - owner abort explicitly

     FAILED state ต้อง:
     - บันทึกว่าล้มเหลวที่ state ไหน
     - บันทึก error reason
     - preserve งานที่ทำไปแล้ว (partial output)
     - แจ้ง owner พร้อม recovery options
```

### Transition Rules

| From → To | Precondition | Timeout | On Timeout |
|---|---|---|---|
| DRAFT → PLANNING | input valid | - | reject + explain |
| PLANNING → RESEARCHING | team built, evidence requirement defined | - | - |
| RESEARCHING → ANALYZING | evidence score ≥ 40 | 3 min per researcher | partial proceed + flag |
| RESEARCHING → HUMAN_REVIEW | evidence score < 40 | - | - |
| ANALYZING → CROSS_QA | all analysts returned output | 2 min per analyst | skip failed agent + flag |
| CROSS_QA → DEBATING | all questions asked | 90 sec | proceed |
| DEBATING → SYNTHESIZING | max 3 rounds OR all resolved | 3 rounds max | close with unresolved flags |
| SYNTHESIZING → DECIDED | CIO output validated | 2 min | fail |
| DECIDED → JOURNALED | journal schema valid | - | retry |

---

## 3.2 Mission Planner

รับ brief จากเจ้าของและแปลงเป็น mission ที่ kernel ทำงานได้

Input:
```
"วิเคราะห์หุ้น MCS ถ้าคิดว่ากำไร Q1 ปี 2026 เป็นฐาน 400 ล้าน
 คิด conservative DCF ราคาที่น่าสนใจถ้าต้องการ MOS > 30%"
```

Output (Mission Object):
```yaml
mission_id: MCS-valuation-20260511-001
domain: investment-war-room
type: stock_analysis
ticker: MCS
market: thai-set
owner_assumption: "normalized_earnings = 400M THB (Q1 2026 annualized)"
owner_constraint: "MOS > 30%"

objective:
  - verify_normalized_earnings       # ตรวจก่อนว่า 400 ล้านสมเหตุสมผลไหม
  - build_conservative_dcf
  - calculate_mos_table
  - identify_price_to_watch
  - define_thesis_breaker

required_agents:
  - researcher-set                   # ดึงข้อมูล official
  - forensic-accountant              # ตรวจคุณภาพกำไร
  - damodaran-valuation              # DCF + reverse DCF
  - klarman-downside                 # downside case
  - portfolio-allocator              # sizing + portfolio fit
  - cio-synthesizer                  # สรุป

evidence_requirements:
  minimum_sources:
    - tier: 1
      count: 3
  required_documents:
    - 56-1-one-report
    - quarterly-filing-Q1-2026
    - mdna

output_requirements:
  mandatory_fields:
    - decision_state
    - normalized_earnings_base
    - fair_value_conservative
    - price_for_mos_30
    - price_to_watch
    - evidence_score
    - thesis_breakers
    - follow_up_events
  report_format: full_investment_report

human_checkpoints:
  - after: RESEARCHING
    condition: always
  - after: SYNTHESIZING
    condition: always
```

---

## 3.3 Team Builder

อ่าน Agent Registry → เลือก agent ที่เหมาะสมกับ mission

กฎการเลือก:

```
1. อ่าน mission.required_agents ถ้าระบุชัด → ใช้ตามนั้น
2. ถ้าไม่ระบุ → ใช้ default team ของ domain นั้น
3. ตรวจว่า agent ที่เลือกมี backend ที่ healthy ไหม
4. ถ้า backend ล้ม → route ไป fallback model
5. ถ้าไม่มี fallback → exclude agent + flag ใน mission log
6. สร้าง execution plan: agent ไหนทำงานลำดับไหน / ใครทำงาน parallel

Execution Plan สำหรับ War Room:
  Sequential:  researcher-set (ต้องทำก่อนเสมอ)
  Parallel:    forensic, damodaran, klarman, portfolio (หลัง evidence pack พร้อม)
  Sequential:  cio-synthesizer (ต้องรอทุกคนเสร็จ)
```

---

## 3.4 Context Manager

### ปัญหาที่ต้องแก้

```
Situation:
  Evidence Pack = 80,000 tokens
  6 analyst agents ต้องรับ Evidence Pack พร้อมกัน
  บาง model มี context limit 32,000 tokens
  บาง model คิดค่าตาม token ที่ส่งไป

ถ้าไม่มี Context Manager:
  บาง agent จะไม่ได้รับข้อมูลครบ
  ข้อมูลถูกตัดแบบ random ไม่ใช่ smart
  agent วิเคราะห์บนข้อมูลผิดโดยไม่รู้ว่าผิด
```

### Context Manager Components

```
Context Budget Tracker
├── รู้ว่าแต่ละ model มี context limit เท่าไร (จาก Model Registry)
├── คำนวณ: persona + skill + evidence + output schema = total ≤ limit?
└── ถ้าเกิน → trigger Smart Compressor ก่อนส่ง

Smart Compressor
├── กฎ: FACT labels ลบไม่ได้
├── กฎ: Source Log ลบไม่ได้
├── กฎ: Data Gaps ลบไม่ได้
├── กฎ: Key Numbers ลบไม่ได้ (revenue, profit, debt)
├── ลบได้: verbose context, ย่อหน้าซ้ำซ้อน, background ที่ agent ไม่ need
└── บันทึก: บอกใน log ว่า compress ไปเท่าไร เพราะอะไร

Context Distributor
├── Researcher Agent → full evidence pack (ใช้ long-context model)
├── Forensic Accountant → financial statements section + notes
├── Valuation Agent → financial + business model section
├── Risk Agent → risk factor + downside section
├── Portfolio Agent → summary + current portfolio context
└── CIO → summary ของแต่ละ agent's output (ไม่ใช่ full evidence)
```

### Context Budget Policy

```yaml
# ใน Model Registry
models:
  gemini-2-flash:
    context_limit_tokens: 1000000
    context_cost_per_1k_input: 0.00
    preferred_for: [research, long_document_reading]

  claude-opus:
    context_limit_tokens: 200000
    context_cost_per_1k_input: 0.015
    preferred_for: [synthesis, complex_reasoning]

  zai-default:
    context_limit_tokens: 128000
    context_cost_per_1k_input: 0.001
    preferred_for: [analysis, parallel_tasks]

context_policy:
  compress_if_above_percent: 80    # compress ถ้า usage > 80% ของ limit
  warn_if_above_percent: 70
  always_preserve: [facts, sources, key_numbers, data_gaps]
```

---

## 3.5 Evidence Controller

ควบคุมว่าข้อมูลที่เข้าระบบผ่านมาตรฐานหรือไม่

### Claim Tagging Standard

ทุก claim ในระบบต้องถูก tag ด้วย label ใดลาบเลหนึ่ง:

```
FACT           → ข้อมูลตรงจาก official document, มี source tier ระบุ
DERIVED        → คำนวณจาก FACT, methodology ชัดเจน
ASSUMPTION     → สิ่งที่ตั้งขึ้นเพื่อ model เช่น growth rate
ESTIMATE       → ประมาณการพร้อม methodology และ confidence level
UNVERIFIED     → จาก secondary source ยังไม่มี Tier 1-2 รองรับ
MANAGEMENT_CLAIM → คำพูดของผู้บริหาร ไม่ใช่ fact จนกว่าจะมี evidence
MARKET_EXPECTATION → สิ่งที่ตลาด price in อยู่ อาจไม่ตรงกับ fundamental
```

### Evidence Pack Structure

```
evidence_pack/
├── metadata.yaml              # mission_id, date, market, ticker
├── source_log.yaml            # ทุก source ที่ใช้พร้อม tier
├── financial_statements/
│   ├── income_statement.md    # [FACT] labeled
│   ├── balance_sheet.md       # [FACT] labeled
│   ├── cashflow_statement.md  # [FACT] labeled
│   └── notes.md               # [FACT] labeled
├── business_context/
│   ├── business_model.md
│   ├── segment_data.md
│   └── risk_factors.md
├── management_communication/
│   ├── mdna.md                # [MANAGEMENT_CLAIM] labeled
│   └── opportunity_day.md     # [MANAGEMENT_CLAIM] labeled
├── market_context/
│   ├── industry_data.md
│   └── peer_comparison.md
└── data_gaps.md               # สิ่งที่หาไม่ได้ บอกให้ชัด
```

### Evidence Score Calculation

```
Evidence Score (0-100):

Base Score:
  Tier 1 source พบ  → +25 per source (max 50)
  Tier 2 source พบ  → +10 per source (max 20)
  Tier 3 source พบ  → +5 per source (max 10)

Bonus:
  ครบทุก required document → +10
  ไม่มี critical data gap → +10

Penalty:
  Critical data gap → -15 per gap
  Tier 5 only (no Tier 1-3) → -20

Threshold:
  ≥ 70: proceed normally
  40-69: proceed with HUMAN_REVIEW gate
  < 40: must HUMAN_REVIEW before proceed
  < 20: recommend abort + explain to owner
```

---

## 3.6 Debate Controller

### ทำไมต้องมีกฎ

ถ้าไม่มีกฎ: debate loop ไม่มีวันจบ, agent ที่ "ดังกว่า" จะ dominate
โดยไม่มีเหตุผล, disagreement ถูก average out แทนที่จะ preserve

### Debate Protocol

```
Round Structure:
  Maximum rounds: 3
  ถ้า resolve ก่อน 3 รอบ → ปิด debate บันทึกว่า "resolved in round X"
  ถ้า 3 รอบแล้วยังไม่ resolve → ปิดด้วย "unresolved disagreement"
  CIO ไม่ resolve artificially — ต้องนำเสนอทั้งสองมุมให้ owner

Per Round Format:
  1. Agent A สร้าง challenge message
     - ต้องอ้าง specific claim ของ Agent B
     - ต้องระบุว่าไม่เห็นด้วยกับ claim ใด
     - ต้องมี counter-evidence หรือ counter-argument
  2. Agent B ตอบ
     - ยืนยัน claim เดิมพร้อม evidence เพิ่ม
     - หรือ update/retract claim พร้อมอธิบาย
  3. Debate Controller บันทึก: resolved / partial / unresolved

Weighting Rules (เมื่อ evidence conflict):
  Tier 1 evidence > Tier 2 > Tier 3 > ASSUMPTION > ESTIMATE
  ถ้า 2 agents เห็นต่าง: agent ที่มี Tier 1 evidence มีน้ำหนักกว่า
  ถ้า evidence tier เท่ากัน: disagreement เป็น valuable signal
  ห้าม average out — ให้ preserve ทั้งสองมุม

Challenge Rules:
  Agent X สามารถ challenge Agent Y ได้ถ้า:
    - X กับ Y มี interaction_rule: can_question ซึ่งกัน
    - หรือ disagreement เกิน threshold ที่กำหนดใน domain config
  ห้าม challenge ตัวเอง
  ห้าม challenge researcher ในเรื่อง fact (ถ้าอยากได้ข้อมูลเพิ่ม → evidence_request)
```

### Evidence Request Loop

```
เมื่อ agent ต้องการข้อมูลเพิ่มระหว่าง analysis:

Agent sends evidence_request message:
  from: damodaran-valuation
  to: researcher-set
  request: "ต้องการ capex 5 ปีย้อนหลัง และ depreciation schedule"
  reason: "ใช้คำนวณ reinvestment rate สำหรับ DCF"
  required_tier: "tier_1"

Researcher ตอบ:
  - ถ้าหาได้ → ส่ง evidence_response + update evidence pack
  - ถ้าหาไม่ได้ → ส่ง not_found response + suggest alternative source
  - เพิ่ม data gap ถ้าข้อมูลนั้น critical

Maximum evidence request rounds: 2
(ป้องกัน loop ไม่สิ้นสุด)
```

---

## 3.7 Synthesis Engine (CIO)

รับ output ของทุก agent มาสังเคราะห์เป็น final output

```
Input:
  - Individual analysis จากทุก analyst agent
  - Debate records (resolved + unresolved)
  - Open questions ที่ยังไม่ได้ตอบ
  - Data gaps ทั้งหมด

Process:
  1. Agreement Mapping
     สิ่งที่ agent ≥ 75% เห็นตรงกัน → confidence signal สูง
     สิ่งที่ agent < 50% เห็นตรงกัน → flag เป็น uncertain

  2. Disagreement Preservation
     ห้าม resolve disagreement ที่ยังเปิดอยู่
     ต้อง present ทั้งสองมุม: "Damodaran เห็นว่า X, Klarman เห็นว่า Y"
     บอก owner ว่าความเสี่ยงของการเชื่อแต่ละมุมคืออะไร

  3. Decision State Determination
     พิจารณาจาก: evidence quality + valuation + downside risk + conviction
     apply Company Constitution rules ก่อน commit

  4. Output Assembly
     สร้าง Final Report ตาม Output Standard
     verify ว่า mandatory fields ครบ

Output Validation (ก่อน SYNTHESIZING → DECIDED):
  ✓ decision_state มีและเป็น valid enum
  ✓ fair_value_conservative มีและเป็น number
  ✓ price_to_watch มีและ < current_price (สำหรับ WAIT_FOR_PRICE state)
  ✓ thesis_breaker list ไม่ว่าง
  ✓ evidence_score คำนวณแล้ว
  ✗ ห้ามมี "buy recommendation" หรือ "sell recommendation" (Company Constitution)
```

---

## 3.8 Company Constitution Enforcer

กฎระดับบริษัทที่ override ทุก agent, ทุก mission, ทุก domain

### ทำไมต้องมี Company Constitution

```
Agent Rule:     "Damodaran ต้องทำ sensitivity analysis"
                → apply เฉพาะ Damodaran agent

Company Rule:   "ห้ามสรุปว่าน่าลงทุนโดยไม่มี normalized earnings ผ่าน forensic ก่อน"
                → apply กับทุก agent ทุก mission ทุก domain
                → ไม่มีข้อยกเว้น
```

### Enforcement Levels

```
BLOCK_MISSION        → ห้าม mission proceed ถ้า rule นี้ถูก violate
                       (เช่น: ห้าม analysis ถ้าไม่มี evidence)

INSERT_HUMAN_REVIEW  → เพิ่ม human checkpoint ก่อน proceed
                       (เช่น: ถ้า evidence score < 40 ต้องถาม owner)

WARN_AND_FLAG        → proceed ได้ แต่ flag ไว้ใน output และ log
                       (เช่น: ถ้าใช้ Tier 5 source ต้องแจ้งในรายงาน)

REJECT_OUTPUT        → reject agent output ถ้า violate
                       (เช่น: agent output มีคำว่า "buy recommendation" → reject)
```

### Investment War Room Constitution (ตัวอย่าง)

```yaml
# domain: investment-war-room
company_constitution:

  - id: no_analysis_without_normalized_earnings
    description: "ห้าม valuation ทุกรูปแบบถ้า normalized earnings ยังไม่ผ่าน forensic review"
    enforcement: BLOCK_MISSION
    applies_to: [damodaran-valuation, klarman-downside]
    exception: none

  - id: evidence_required_for_all_facts
    description: "ทุก FACT label ต้องมี source tier ระบุ ห้าม sourceless fact"
    enforcement: REJECT_OUTPUT
    applies_to: all_agents
    exception: none

  - id: data_gap_must_surface
    description: "ถ้า critical field หาข้อมูลไม่ได้ ต้องแจ้ง owner ก่อน proceed"
    enforcement: INSERT_HUMAN_REVIEW
    applies_to: researcher_agents
    critical_fields: [normalized_earnings, capex, debt_structure, major_shareholder]

  - id: no_buy_sell_recommendation
    description: "ระบบไม่ออก buy/sell recommendation ออกได้แค่ decision_state"
    enforcement: REJECT_OUTPUT
    applies_to: all_agents
    exception: none

  - id: low_evidence_score_gate
    description: "evidence score < 40 ต้องผ่าน human review ก่อน analysis"
    enforcement: INSERT_HUMAN_REVIEW
    threshold: 40
    applies_to: evidence_controller
    exception: owner_explicit_override

  - id: uncertainty_must_be_explicit
    description: "ทุก assumption ต้องถูก label และระบุว่า sensitive ต่ออะไร"
    enforcement: WARN_AND_FLAG
    applies_to: all_agents
```

---

## 3.9 Human-in-the-Loop Protocol

### ทำไมต้องมี

Owner ต้องสามารถ control ระบบที่ซับซ้อนได้
ไม่ใช่แค่ถาม → รอ → รับผล
แต่ต้อง pause ที่ checkpoints สำคัญ

### Human Gate Types

```
MANDATORY_GATE     → ระบบต้อง pause รอ owner เสมอ ไม่มีข้อยกเว้น
                     ตัวอย่าง: ก่อน DECIDED

CONDITIONAL_GATE   → pause ถ้า condition เป็นจริง
                     ตัวอย่าง: pause ถ้า evidence score < 40

OPTIONAL_GATE      → pause เฉพาะถ้า owner set ไว้ใน mission config
                     ตัวอย่าง: pause หลัง individual analyses

AUTO_PROCEED_GATE  → pause รอ input แต่ถ้าไม่ตอบใน X วินาที → proceed
                     ตัวอย่าง: pause หลัง RESEARCHING, auto-proceed 60 วินาที
```

### Gate Messages

ทุก gate ต้องแสดง:

```
[HUMAN REVIEW REQUIRED]
Mission: MCS-valuation-20260511-001
State: After RESEARCHING
Reason: Evidence pack ready for review

Summary:
  Sources found:    5 (3 Tier 1, 2 Tier 2)
  Evidence score:   72/100
  Critical gaps:    1 (capex detail from 56-1 notes not found)
  Documents:        56-1 (2025), Q1-2026 filing, MD&A

⚠ Data Gap: Capex breakdown ไม่พบใน filing
  Impact: Damodaran DCF จะต้อง assume capex = depreciation
  Option: ค้นหาเพิ่มใน opportunity day / หรือ accept assumption

Actions:
  [1] Proceed with current evidence (accept data gap)
  [2] Request additional research on: [specify]
  [3] Abort mission
```

---

# PART 4: REGISTRY LAYER

Registry คือฐานข้อมูล configuration ทั้งหมดของบริษัท
ทุกอย่างอยู่ใน YAML files — เพิ่ม/แก้ได้โดยไม่แตะ code

## 4.1 Agent Registry

```yaml
# agents/damodaran-valuation.yaml

id: damodaran-valuation
name: "Damodaran Valuation Partner"
version: "1.0"
domain: [investment-war-room]        # domain ที่ใช้ได้
active: true

role: valuation_analyst
description: "DCF-first valuation analyst. Story must become numbers."

# Model Selection
model:
  primary:
    provider: claude
    model: claude-opus-4-5
  fallback:
    - provider: zai
      model: zai-default
    - provider: gemini
      model: gemini-2-flash

# Identity
identity:
  persona_file: personas/damodaran.md
  worldview:
    - "ทุก valuation คือการแปลง story เป็นตัวเลข"
    - "ถ้า story ไม่ชัด ตัวเลขไม่มีความหมาย"
  cognitive_bias_awareness:
    - "ระวัง terminal value สูงเกินไป"
    - "ระวัง growth assumption ที่ไม่มี reinvestment รองรับ"
    - "ชอบ reverse DCF เพื่ออ่าน market expectation"

# Capabilities
skills:
  - intrinsic_valuation
  - reverse_dcf
  - sensitivity_analysis
  - narrative_to_numbers

# What this agent needs to work
requires:
  - evidence_pack
  - normalized_earnings_result    # ต้องรอ forensic ก่อน

# What this agent can talk to
interaction_rules:
  can_question:
    - researcher-set
    - forensic-accountant
    - business-quality-analyst
  must_challenge:
    - growth_assumptions          # ถ้าเห็น growth assumption → ต้อง challenge
    - margin_expansion            # ถ้าเห็น margin expansion assumption → ต้อง challenge
  cannot_question:
    - cio-synthesizer             # CIO ไม่ถูก challenge ใน round นี้

# Output Contract (Zod schema reference)
output_contract:
  schema_ref: schemas/damodaran-output.schema.yaml
  mandatory_fields:
    - fair_value_conservative
    - fair_value_base
    - fair_value_optimistic
    - implied_growth_at_market_price
    - conviction_level             # 1-10 with reasoning
    - key_assumptions              # list พร้อม source
    - what_would_change_my_mind    # ต้องมี
    - data_gaps_found
  forbidden_content:
    - buy_recommendation
    - sell_recommendation

# Performance
timeout_seconds: 120
max_tokens: 8192
context_budget_override: null     # null = use global policy
```

## 4.2 Skill Registry

```yaml
# skills/normalized-earnings.yaml

id: normalized_earnings
name: "Normalized Earnings Analysis"
version: "1.2"

description: >
  วิเคราะห์กำไรปกติโดยแยกรายการพิเศษออก
  เปรียบเทียบ reported profit กับ operating cash flow
  ระบุความมั่นใจของ normalized base

skill_file: skills/normalized-earnings.md    # prompt content

applicable_to:
  - forensic-accountant
  - damodaran-valuation                      # ใช้ได้ทั้งสอง agent

input_requirements:
  required:
    - income_statement
    - cashflow_statement
  preferred:
    - notes_to_financial_statement
    - mdna

output_schema:
  - reported_profit:       number
  - one_off_items:         list
  - normalized_profit:     number
  - cashflow_quality:      enum [high, medium, low, negative]
  - confidence:            enum [high, medium, low]
  - data_gaps:             list

rules:
  - "ห้ามใช้ reported net profit เป็นฐานทันที ก่อนตรวจ one-off"
  - "ต้องเปรียบเทียบ OCF กับ net profit ทุกครั้ง"
  - "ถ้า OCF < 70% ของ net profit ต้อง flag earnings quality"
  - "ระบุ confidence ของ normalized base ทุกครั้ง"
```

## 4.3 Source Registry

```yaml
# sources/thai-set.yaml

market: thai-set

tier_1_sources:
  - id: set_quarterly_filing
    name: "SET Quarterly Filing (56-2)"
    url_pattern: "https://www.set.or.th/en/market/filings"
    reliability: tier_1
    label_as: FACT
    use_for: [financial_results, corporate_action, official_disclosure]

  - id: annual_report_56_1
    name: "56-1 One Report (Annual)"
    url_pattern: "https://market.sec.or.th/public/idisc/en/FinancialStatement"
    reliability: tier_1
    label_as: FACT
    use_for: [business_model, risk_factor, segment_data, five_year_summary]

tier_2_sources:
  - id: opportunity_day
    name: "Opportunity Day / Analyst Meeting"
    reliability: tier_2
    label_as: MANAGEMENT_CLAIM
    use_for: [management_guidance, strategy_context]
    note: "Label ต้องเป็น MANAGEMENT_CLAIM ไม่ใช่ FACT"

tier_3_sources:
  - id: analyst_report
    name: "Broker Analyst Report"
    reliability: tier_3
    label_as: UNVERIFIED
    use_for: [market_expectation, peer_comparison, consensus_forecast]

tier_4_sources:
  - id: news_thai
    name: "Thai Financial News"
    reliability: tier_4
    label_as: UNVERIFIED
    use_for: [recent_event, sentiment, catalyst_timing]

tier_5_sources:
  - id: social_media
    name: "Social Media / Chat Groups"
    reliability: tier_5
    label_as: UNVERIFIED
    use_for: [rumor_monitoring_only]
    warning: "ห้ามใช้เป็น basis ของ analysis ใดทั้งสิ้น"
```

## 4.4 Model Registry

```yaml
# models/registry.yaml

models:
  claude-opus-4-5:
    provider: claude
    api_type: anthropic-api
    context_limit_tokens: 200000
    strengths: [synthesis, complex_reasoning, writing, thai_explanation]
    best_for: [cio_synthesis, valuation_reasoning, final_report, debate]
    cost_tier: high

  gemini-2-flash:
    provider: gemini
    api_type: gemini-cli
    context_limit_tokens: 1000000
    strengths: [long_context, document_reading, research, web_access]
    best_for: [evidence_research, large_document_analysis, first_pass]
    cost_tier: low

  codex-default:
    provider: codex
    api_type: codex-cli
    context_limit_tokens: 128000
    strengths: [code, structured_output, tool_building, testing]
    best_for: [validator_building, quant_script, data_transform]
    cost_tier: medium

  zai-default:
    provider: zai
    api_type: openai-compatible
    context_limit_tokens: 128000
    strengths: [cheap_parallel_reasoning, adversarial_review]
    best_for: [second_opinion, critique, debate_agent, parallel_tasks]
    cost_tier: very_low

routing_policy:
  evidence_research:      [gemini-2-flash, claude-opus-4-5]
  valuation_reasoning:    [claude-opus-4-5, zai-default]
  deterministic_calc:     [python-quant]
  adversarial_review:     [zai-default, claude-opus-4-5]
  final_synthesis:        [claude-opus-4-5]
  code_or_validator:      [codex-default, claude-opus-4-5]
```

---

# PART 5: INTERNAL MESSAGE PROTOCOL

## 5.1 Message Types

```
brief                → owner → kernel: "นี่คือโจทย์"
task_assignment      → kernel → agent: "นี่คือ task ของคุณ"
question             → agent → agent: "ผมอยากถาม X เกี่ยวกับ Y"
answer               → agent → agent: "คำตอบของคำถาม X คือ..."
challenge            → agent → agent: "ผมไม่เห็นด้วยกับ claim Z เพราะ..."
evidence_request     → agent → researcher: "ต้องการข้อมูล X จาก source tier ≥ Y"
evidence_response    → researcher → agent: "พบข้อมูล X จาก source Y"
not_found_response   → researcher → agent: "ไม่พบ X แนะนำ alternative"
analysis_report      → agent → kernel: "output ของผม"
disagreement         → agent → kernel: "ผมไม่เห็นด้วยกับ agent X เรื่อง Y"
decision_recommendation → kernel → owner: "synthesis และ recommendation"
journal_entry        → kernel → journal: "บันทึกการตัดสินใจ"
human_gate_request   → kernel → owner: "ต้องการ input จากคุณ"
human_gate_response  → owner → kernel: "นี่คือ input ของฉัน"
abort_request        → owner → kernel: "หยุด mission นี้"
```

## 5.2 Message Schema

```json
{
  "message_id": "msg-20260511-001-003",
  "mission_id": "MCS-valuation-20260511-001",
  "timestamp": "2026-05-11T10:23:45Z",
  "message_type": "challenge",
  "from": "klarman-downside",
  "to": "damodaran-valuation",
  "thread_id": "debate-round-1",
  "content": {
    "challenged_claim": "Revenue growth of 15% assumed for years 1-5",
    "challenge_reason": "Historical growth was 8% CAGR. 15% requires new catalyst.",
    "counter_evidence": {
      "claim": "5-year CAGR was 7.8% (FY2020-2025)",
      "source": "56-1 Annual Report 2025",
      "source_tier": "tier_1",
      "label": "FACT"
    },
    "request": "Please justify the 15% assumption or revise downward"
  },
  "requires_response": true,
  "response_deadline_seconds": 90,
  "priority": "high"
}
```

## 5.3 Evidence Response Schema

```json
{
  "message_type": "evidence_response",
  "from": "researcher-set",
  "to": "damodaran-valuation",
  "mission_id": "MCS-valuation-20260511-001",
  "evidence": [
    {
      "claim": "Capex 2022-2025 averaged 85M THB/year",
      "source_name": "56-1 One Report 2025",
      "source_tier": "tier_1",
      "section": "Financial Statements, Note 12",
      "confidence": "high",
      "label": "FACT"
    }
  ],
  "data_gaps": [
    {
      "requested": "Capex plan for 2026-2028",
      "not_found_in": ["56-1", "quarterly-filing", "opportunity-day"],
      "impact": "Cannot verify reinvestment rate assumption",
      "suggested_alternative": "Use management guidance from opportunity day as MANAGEMENT_CLAIM"
    }
  ],
  "evidence_pack_updated": true
}
```

---

# PART 6: OBSERVABILITY & AUDIT SYSTEM

## 6.1 Philosophy

> "ระบบที่ดีไม่ใช่ระบบที่ทำงานถูกต้องเสมอ
>  แต่คือระบบที่รู้ว่าตัวเองทำผิดตรงไหน
>  และมีหลักฐานให้ตรวจสอบทุกการตัดสินใจ"

Observability System ใน onemancompany มีหน้าที่:

```
1. บันทึกทุก LLM call อย่างสมบูรณ์
2. ตรวจสอบว่า output ถูกต้องตาม schema หรือไม่
3. ให้สามารถ replay mission ซ้ำได้
4. ตรวจจับว่า agent hallucinate ตัวเลขหรือไม่
5. วัด quality ของแต่ละ agent
6. track cost และ performance
7. ให้ owner audit ได้ทุกเมื่อ
```

## 6.2 Structured Agent Call Log

ทุก LLM call บันทึกอัตโนมัติก่อนและหลัง:

```json
{
  "log_id": "call-20260511-001-damodaran-001",
  "timestamp_start": "2026-05-11T10:30:00.000Z",
  "timestamp_end": "2026-05-11T10:31:23.412Z",

  "mission_id": "MCS-valuation-20260511-001",
  "mission_state": "ANALYZING",
  "agent_id": "damodaran-valuation",

  "model": {
    "provider": "claude",
    "model_id": "claude-opus-4-5",
    "was_fallback": false,
    "fallback_reason": null
  },

  "context": {
    "input_tokens": 12450,
    "output_tokens": 2180,
    "context_was_compressed": false,
    "compression_ratio": null,
    "context_budget_used_pct": 6.2
  },

  "performance": {
    "latency_ms": 83412,
    "cost_usd": 0.0218,
    "retry_count": 0
  },

  "validation": {
    "schema_passed": true,
    "schema_errors": [],
    "mandatory_fields_present": true,
    "forbidden_content_found": false,
    "constitution_violations": []
  },

  "output_quality": {
    "fact_label_count": 8,
    "assumption_label_count": 5,
    "sources_cited": 4,
    "data_gaps_declared": 1,
    "conviction_level": 6
  },

  "success": true,
  "error": null,

  "input_hash": "sha256:abc123...",     # hash ของ full prompt (privacy)
  "output_hash": "sha256:def456...",    # hash ของ full output
  "input_stored": true,                 # full input เก็บใน storage
  "output_stored": true                 # full output เก็บใน storage
}
```

## 6.3 Mission Trace

บันทึก timeline ของ mission ตั้งแต่ต้นจนจบ:

```json
{
  "mission_id": "MCS-valuation-20260511-001",
  "mission_trace": {

    "created_at": "2026-05-11T10:00:00Z",
    "completed_at": "2026-05-11T11:45:23Z",
    "final_state": "JOURNALED",
    "total_duration_minutes": 105,

    "state_transitions": [
      {"state": "DRAFT",        "entered_at": "10:00:00", "duration_s": 5},
      {"state": "PLANNING",     "entered_at": "10:00:05", "duration_s": 12},
      {"state": "RESEARCHING",  "entered_at": "10:00:17", "duration_s": 420},
      {"state": "HUMAN_REVIEW", "entered_at": "10:07:17", "duration_s": 180, "gate": "Gate1"},
      {"state": "ANALYZING",    "entered_at": "10:10:17", "duration_s": 360},
      {"state": "CROSS_QA",     "entered_at": "10:16:17", "duration_s": 240},
      {"state": "DEBATING",     "entered_at": "10:20:17", "duration_s": 480},
      {"state": "SYNTHESIZING", "entered_at": "10:28:17", "duration_s": 180},
      {"state": "HUMAN_REVIEW", "entered_at": "10:31:17", "duration_s": 840, "gate": "Gate3"},
      {"state": "DECIDED",      "entered_at": "10:45:17", "duration_s": 30},
      {"state": "JOURNALED",    "entered_at": "10:45:47", "duration_s": 15}
    ],

    "agents_executed": [
      {"agent": "researcher-set",       "status": "success", "duration_s": 380, "calls": 2},
      {"agent": "forensic-accountant",  "status": "success", "duration_s": 95,  "calls": 1},
      {"agent": "damodaran-valuation",  "status": "success", "duration_s": 83,  "calls": 1},
      {"agent": "klarman-downside",     "status": "success", "duration_s": 71,  "calls": 1},
      {"agent": "portfolio-allocator",  "status": "failed",  "duration_s": 120, "calls": 2,
       "error": "timeout", "fallback_used": "zai-default"}
    ],

    "human_gates": [
      {"gate": "Gate1", "triggered_by": "after_research", "wait_s": 180,
       "owner_action": "proceed", "owner_note": "ข้อมูลพอใช้ได้"},
      {"gate": "Gate3", "triggered_by": "after_synthesis", "wait_s": 840,
       "owner_action": "revise_assumption",
       "owner_note": "ลด growth assumption เหลือ 10% จาก 12%"}
    ],

    "debate_summary": {
      "rounds": 2,
      "challenges": 3,
      "resolved": 2,
      "unresolved": 1,
      "unresolved_topic": "Terminal growth rate: Damodaran 3% vs Klarman 2%"
    },

    "evidence_summary": {
      "score": 72,
      "tier1_sources": 3,
      "tier2_sources": 2,
      "data_gaps": 1,
      "data_gap_detail": "Capex plan 2026-2028 not found"
    },

    "cost_summary": {
      "total_cost_usd": 0.1423,
      "total_input_tokens": 87450,
      "total_output_tokens": 18230
    }
  }
}
```

## 6.4 Evidence Audit Trail

ทุก claim ในรายงาน final สามารถ trace กลับไปยังต้นทางได้:

```
Evidence Audit Trail: MCS-valuation-20260511-001

CLAIM: "Revenue FY2025 = 2,450M THB"
├── Label:      FACT
├── Made by:    researcher-set
├── Source:     56-1 One Report 2025
├── Source Tier: tier_1
├── Section:    Financial Statements, Page 45
├── Filed on:   2026-03-15
├── Used by:    damodaran-valuation (in DCF base assumptions)
└── Challenged: No

CLAIM: "Revenue growth 10% for Y1-Y5"
├── Label:      ASSUMPTION
├── Made by:    damodaran-valuation
├── Basis:      Historical CAGR 7.8% + management guidance 12%
├── Revised from: 12% → 10% (owner request at Gate 3)
├── Used by:    damodaran-valuation (DCF), cio-synthesizer (synthesis)
└── Challenged: Yes — by klarman-downside (Round 1)
    └── Challenge: "12% terlalu agresif, history only 7.8%"
    └── Resolution: Revised down to 10% after owner review

CLAIM: "Management expects 15% growth in FY2026"
├── Label:      MANAGEMENT_CLAIM
├── Source:     Opportunity Day Q1 2026
├── Source Tier: tier_2
└── Note:       Label is MANAGEMENT_CLAIM not FACT
```

## 6.5 LLM Output Validator

ตรวจ output ของ agent ทุกตัวก่อนที่ kernel จะ accept:

```
Validation Checklist per Agent Output:

Schema Validation:
  ✓ output เป็น valid JSON/YAML ตาม schema ที่กำหนด
  ✓ mandatory fields ทุก field มีครบ
  ✓ field types ถูกต้อง (number, enum, list, etc.)
  ✓ enum values อยู่ใน allowed list

Content Validation:
  ✓ ทุก FACT มี source ระบุ (ถ้าไม่มี → reject + request retry)
  ✓ conviction_level เป็น 1-10 (ถ้าไม่ใช่ → reject)
  ✓ ไม่มี forbidden content (buy/sell recommendation)
  ✓ data_gaps field มี (อาจเป็น empty list แต่ต้องมี)

Grounding Check:
  ✓ ตัวเลขสำคัญใน output มีใน evidence pack ไหม?
      → Revenue: 2,450M → ตรวจว่า evidence pack มีตัวเลขนี้ไหม
      → ถ้าไม่มี → flag เป็น UNVERIFIED_NUMBER + log warning
  ✓ Source ที่อ้างมี source tier ที่ถูกต้องไหม?

Constitution Check:
  ✓ ผ่าน Company Constitution rules ทุกข้อ
  ✗ ถ้า violate → reject output + log violation

On Failure:
  Retry once with explicit correction instruction
  ถ้า retry ยังไม่ผ่าน → mark agent as FAILED + log + notify
```

## 6.6 Agent Quality Scorecard

สะสม metric ของแต่ละ agent ตามเวลา:

```yaml
# agent_scorecard: damodaran-valuation

agent_id: damodaran-valuation
period: 2026-01 to 2026-05
missions_participated: 12

schema_pass_rate: 91.7%        # 11/12 ผ่าน schema validation ครั้งแรก
retry_rate: 8.3%               # 1/12 ต้อง retry
timeout_rate: 0%
fallback_rate: 0%

content_quality:
  avg_fact_labels_per_output: 6.2
  avg_sources_cited: 3.8
  avg_data_gaps_declared: 1.1
  conviction_level_distribution:
    1-3: 25%    # ระวัง position ต่ำ
    4-6: 50%
    7-10: 25%

constitution_violations: 0
forbidden_content_incidents: 0

grounding_check:
  numbers_in_output_verified: 87%
  numbers_flagged_unverified: 13%

avg_latency_ms: 78420
avg_cost_usd: 0.019
avg_input_tokens: 11800
avg_output_tokens: 2100
```

## 6.7 Mission Replay System

### ทำไมต้องมี Replay

```
ต้องการ:
  - re-run analysis ด้วย assumption ที่ต่างออกไป
  - ตรวจสอบว่า output เปลี่ยนไปไหมถ้า model เปลี่ยน
  - debug ว่า agent คิดอะไรตอนที่ output ออกมาแปลก
  - เปรียบเทียบ analysis ของ MCS ที่ทำ 3 เดือนก่อนกับวันนี้
```

### Replay Requirements

```
สิ่งที่ต้องเก็บทุก mission:
  full_input_per_agent       # full prompt ที่ส่งไปให้แต่ละ agent
  full_output_per_agent      # full response ที่ agent return
  evidence_pack_snapshot     # snapshot ของ evidence pack ณ เวลานั้น
  all_messages               # ทุก message ใน Internal Protocol
  state_transition_log       # timestamp ของทุก state change
  human_gate_responses       # owner ตอบอะไรที่แต่ละ gate

Replay Modes:
  FULL_REPLAY    → run ทุกอย่างใหม่ด้วย real LLM, evidence ใหม่
  AGENT_REPLAY   → run เฉพาะ agent ที่เลือก ด้วย saved input
  COMPARE_REPLAY → run mission เดิมกับ assumption ต่างกัน เปรียบเทียบ output
  DRY_RUN        → run ด้วย mock adapters เพื่อ test logic

Replay Storage:
  stored at: missions/{mission_id}/replay/
  format: structured JSON + markdown
  retention: ไม่ลบ (investment decisions ต้องอ้างอิงได้)
```

## 6.8 Health Monitor

ตรวจสอบสุขภาพของระบบก่อน และระหว่าง การทำงาน:

```
Backend Health Check (run ก่อนทุก session):
  ├── gemini-cli     → gemini --version + ping test
  ├── claude-api     → auth check + minimal call
  ├── zai-api        → auth check + endpoint check
  ├── codex-cli      → codex --version + ping
  └── python-quant   → import check + math test

Output:
  ✓ gemini-cli:  online (v2.1.0) | latency: 234ms
  ✓ claude-api:  online | latency: 412ms | auth: valid
  ✓ zai-api:     online | latency: 189ms | auth: valid
  ✗ codex-cli:   OFFLINE — session expired, re-login required
  ✓ python-quant: online

Degraded Mode Decision:
  ถ้า primary backend ของ agent X ล้ม:
    → route ไป fallback (ตาม Model Registry)
  ถ้าทุก backend ของ agent X ล้ม:
    → exclude agent X + flag + notify owner
  ถ้า researcher agent ล้มทั้งหมด:
    → abort mission (ไม่มี evidence → ไม่วิเคราะห์)
```

## 6.9 Observability Storage

```
Storage Architecture:

SQLite Database: onemancompany.db
  tables:
    missions            → mission metadata + state
    agent_calls         → ทุก LLM call log (JSON)
    messages            → ทุก internal message
    evidence_items      → ทุก claim พร้อม label + source
    human_gates         → ทุก gate request + response
    debate_records      → debate rounds + outcomes
    journal_entries     → decision journal
    agent_scorecard     → aggregated agent quality metrics
    cost_tracking       → cost per mission per agent

File Storage: missions/
  missions/{mission_id}/
    mission.json          → mission object
    evidence_pack/        → evidence pack files
    replay/
      inputs/             → full inputs per agent
      outputs/            → full outputs per agent
      messages.json       → all protocol messages
    report/
      final-report.md     → final output
      synthesis.json      → structured synthesis

Query Examples:
  "ดู log ของ damodaran ใน mission MCS"
  "cost รวมของ missions ทั้งหมดใน เดือน May"
  "agent ไหน schema fail บ่อยที่สุด"
  "ทุก mission ที่ decision state = WAIT_FOR_PRICE"
  "replay mission MCS ด้วย growth assumption 8%"
```

---

# PART 7: DECISION JOURNAL & LEARNING LOOP

## 7.1 ทำไม Journal ต้องเริ่มจาก Phase 0

ถ้าไม่ออกแบบ journal schema ตั้งแต่วันแรก:
→ ข้อมูลทุกการตัดสินใจใน phase แรกๆ หายไป
→ เปิด learning loop ในอนาคตแล้วไม่มีอะไรให้เรียน

Journal เขียนทุก mission ตั้งแต่ Phase 3
Outcome section เติมได้ภายหลังเมื่อรู้ผล

## 7.2 Decision Journal Schema

```yaml
# journal entry schema

journal_id: "MCS-journal-20260511"
mission_id: "MCS-valuation-20260511-001"
created_at: "2026-05-11T11:46:00Z"

# ANALYSIS RECORD (เขียนทันทีหลัง mission)
subject:
  type: stock                          # stock | project | business_decision | research
  ticker: MCS
  market: thai-set
  company_name: "MCS Medical"

decision:
  state: WAIT_FOR_PRICE               # decision state enum
  decision_date: "2026-05-11"
  rationale_summary: >
    ธุรกิจดี margins สม่ำเสมอ แต่ราคาตลาดยัง price-in
    growth สูงกว่า conservative assumption ของเรา
    รอราคาที่ให้ MOS ≥ 30%

valuation:
  fair_value_conservative: 28.50      # THB
  fair_value_base: 34.20
  price_for_mos_30: 23.94            # fair_value_conservative × 0.7
  price_to_watch: 24.00
  current_price_at_analysis: 31.50
  market_cap_at_analysis: 12600      # M THB

assumptions:
  normalized_earnings: 400           # M THB (Q1 2026 annualized)
  revenue_growth_y1_y5: 10.0        # %
  operating_margin_target: 18.5     # %
  wacc: 9.2                          # %
  terminal_growth: 2.5              # %
  note: "owner revised growth from 12% to 10% at Gate 3"

evidence:
  score: 72
  tier1_sources_used: 3
  tier2_sources_used: 2
  data_gaps:
    - "Capex plan 2026-2028 ไม่พบใน filing — used historical avg instead"

analyst_views:
  damodaran:  {fair_value: 34.20, conviction: 6, view: "fair value, not cheap enough"}
  klarman:    {fair_value: 27.80, conviction: 7, view: "downside if earnings normalize lower"}
  consensus:  "wait for better price"
  key_disagreement: "Terminal growth: Damodaran 3% vs Klarman 2% — unresolved"

thesis_breakers:
  - "Q2 2026 earnings < 80M THB (suggests Q1 was peak)"
  - "Major hospital contract loss"
  - "Competitor enters market with lower price"
  - "Founder sell ≥ 5% stake"

follow_up_events:
  - event: "Q2 2026 earnings release"
    expected: "2026-08-15"
    watch_for: "Normalized earnings validation"
  - event: "Annual report 2026"
    expected: "2027-03-01"
    watch_for: "Capex plan update"

# OUTCOME RECORD (เติมทีหลังเมื่อรู้ผล)
outcome:
  updated_at: null                    # ยังไม่รู้ผล
  what_happened: null
  price_reached_target: null
  thesis_held: null
  actual_outcome: null
  lessons:
    - what_worked: null
    - what_was_wrong: null
    - what_to_do_differently: null
```

## 7.3 Learning Loop Design

```
Learning Loop Cycle:

Phase A — Record (ทุก mission)
  → เขียน journal entry ทันทีหลัง JOURNALED state
  → บันทึก assumptions + thesis + breakers

Phase B — Track (ongoing)
  → ระบบ remind เมื่อ follow_up_events ครบกำหนด
  → owner อัปเดต outcome section

Phase C — Review (quarterly)
  → query journal: missions ที่ outcome รู้แล้ว
  → เปรียบเทียบ: thesis held vs broken
  → ดู: data gaps ไหนที่ส่งผลต่อ decision มากที่สุด
  → ดู: agent ไหนที่ conviction level แม่นยำที่สุด

Phase D — Pattern Detection (เมื่อมี data เพียงพอ ≥ 20 missions)
  → ค้นหา pattern: เราพลาดตรงไหนบ่อย
  → ค้นหา: thesis breaker ไหนที่เกิดบ่อยในบาง sector
  → ค้นหา: agent ไหนที่ over/under-confident

Phase E — Refine (ปรับปรุงระบบ)
  → update agent constitution rules จาก lessons
  → update skill rules จาก common mistakes
  → update evidence requirements จาก data gaps ที่สำคัญ
```

---

# PART 8: MULTI-DOMAIN ARCHITECTURE

## 8.1 Domain Structure

```
onemancompany/
│
├── kernel/                    ← Company Kernel (domain-agnostic, ไม่แตะ)
│
├── domains/                   ← แต่ละ domain คือ "บริษัท" หนึ่ง
│   │
│   ├── investment-war-room/   ← Use case แรก
│   │   ├── domain.yaml        ← Company Constitution + default team
│   │   ├── agents/            ← Agent cards เฉพาะ domain นี้
│   │   ├── skills/            ← Skills เฉพาะ domain นี้
│   │   ├── missions/          ← Mission templates
│   │   └── output-templates/  ← Report formats
│   │
│   ├── research-studio/       ← Future: research project management
│   │   ├── domain.yaml
│   │   └── ...
│   │
│   └── _template/             ← Copy นี้เพื่อสร้าง domain ใหม่
│       ├── domain.yaml
│       └── README.md
│
├── registry/                  ← Global registries (ใช้ร่วมกันทุก domain)
│   ├── models.yaml
│   ├── tools.yaml
│   └── sources/
│       ├── thai-set.yaml
│       ├── us-market.yaml
│       └── _template.yaml
│
├── adapters/                  ← Runtime adapters
└── observability/             ← Logs, traces, journal
```

## 8.2 Domain Configuration File

```yaml
# domains/investment-war-room/domain.yaml

id: investment-war-room
name: "Investment War Room"
version: "1.0"
description: "Investment analysis and decision making for Thai and US markets"

# Company Constitution for this domain
constitution:
  rules_file: domain-constitution.yaml

# Default team (ถ้า mission ไม่ระบุ agent)
default_team:
  researcher:    researcher-set
  analysts:      [forensic-accountant, damodaran-valuation, klarman-downside]
  synthesizer:   cio-synthesizer
  always_include: [pro-investor]

# Available mission types
mission_types:
  - id: stock_analysis
    template: missions/stock-analysis.yaml
    default_agents: [researcher-set, forensic-accountant, damodaran-valuation,
                     klarman-downside, portfolio-allocator, cio-synthesizer]

  - id: portfolio_review
    template: missions/portfolio-review.yaml
    default_agents: [portfolio-allocator, cio-synthesizer]

  - id: quick_screen
    template: missions/quick-screen.yaml
    default_agents: [researcher-set, damodaran-valuation]

# Markets supported
markets: [thai-set, us-nyse, us-nasdaq]

# Output standards
output:
  mandatory_report_sections:
    - decision_summary
    - evidence_quality
    - normalized_earnings
    - valuation
    - downside_case
    - decision_state
    - price_to_watch
    - thesis_breakers
    - follow_up_checklist

# Human checkpoint defaults
human_checkpoints:
  after_research: always
  after_synthesis: always
  on_low_evidence: always

# Journal requirements
journal:
  required: true
  template: journal/investment-journal.yaml
```

## 8.3 เพิ่ม Domain ใหม่

```
ขั้นตอน:
  1. copy domains/_template/ ไปเป็น domains/{new-domain}/
  2. แก้ domain.yaml: ชื่อ, constitution, default team
  3. สร้าง agent cards ที่เหมาะกับ domain ใหม่
  4. สร้าง skill cards
  5. สร้าง mission templates
  6. run test mission ด้วย mock adapters

ไม่ต้องแตะ:
  - kernel/
  - adapters/
  - observability/
  - registry/models.yaml  (แก้ได้ถ้าต้องการ model ใหม่)
```

---

# PART 9: RUNTIME & PROTOCOL LAYER

## 9.1 Runtime Adapter Layer

Adapter แปลง "คำสั่ง run agent" → "call ไปหา model จริง"

```
Adapter Interface (ทุก adapter ต้อง implement):
  run(prompt: string, config: AdapterConfig) → AgentResult
  healthCheck() → HealthStatus
  estimateTokens(prompt: string) → number
  estimateCost(input_tokens, output_tokens) → number

Adapters:
  ClaudeAdapter    → Anthropic API (ANTHROPIC_API_KEY)
  GeminiAdapter    → Gemini CLI (gemini command)
  ZAIAdapter       → OpenAI-compatible API (ZAI_API_KEY + ZAI_BASE_URL)
  CodexAdapter     → Codex CLI (codex command)
  PythonQuantAdapter → Python subprocess (deterministic calculations)
  HumanAdapter     → pause + wait for owner input (console/future UI)
  LocalLLMAdapter  → future: Ollama or similar
```

## 9.2 CLI Interface

```
oneman [command] [subcommand] [options]

Mission Commands:
  oneman mission create --domain investment-war-room --type stock_analysis --ticker MCS
  oneman mission run --id MCS-valuation-20260511-001
  oneman mission status --id MCS-valuation-20260511-001
  oneman mission abort --id MCS-valuation-20260511-001
  oneman mission replay --id MCS-valuation-20260511-001 [--assumption growth=8%]
  oneman mission list [--domain investment-war-room] [--state DECIDED]

Agent Commands:
  oneman agent ask --agent damodaran-valuation "วิเคราะห์ MCS DCF ให้หน่อย"
  oneman agent list [--domain investment-war-room]
  oneman agent create --id new-analyst --from-template
  oneman agent test --id damodaran-valuation --fixture test/fixtures/damodaran-test.json

Team Commands:
  oneman team status              → ดู health ของทุก backend
  oneman team list                → ดูทีมทั้งหมด

Journal Commands:
  oneman journal view --ticker MCS
  oneman journal update --id MCS-journal-20260511 --outcome "earnings Q2 confirmed"
  oneman journal list [--state open] [--domain investment-war-room]

Observability Commands:
  oneman log show --mission MCS-valuation-20260511-001
  oneman log show --agent damodaran-valuation --last 10
  oneman audit trail --mission MCS-valuation-20260511-001
  oneman scorecard --agent damodaran-valuation
  oneman cost --period 2026-05

Domain Commands:
  oneman domain list
  oneman domain create --id research-studio
  oneman domain switch --id investment-war-room
```

## 9.3 MCP Interface (Phase 4)

Expose onemancompany เป็น tools สำหรับ Claude Code หรือ LLM client:

```
MCP Tools:
  onemancompany.create_mission(domain, type, params) → mission_id
  onemancompany.run_mission(mission_id) → mission_status
  onemancompany.ask_agent(agent_id, question, context?) → response
  onemancompany.get_evidence_pack(mission_id) → evidence_pack
  onemancompany.run_committee(mission_id) → synthesis
  onemancompany.generate_mos_table(ticker, assumptions) → mos_table
  onemancompany.get_journal(ticker?, domain?) → journal_entries
  onemancompany.compare_candidates(tickers[], criteria) → comparison
  onemancompany.get_mission_trace(mission_id) → trace_log
  onemancompany.get_agent_scorecard(agent_id) → scorecard

เมื่อ MCP พร้อม:
  Claude Code กลายเป็น "boardroom terminal" ที่ owner คุยด้วย
  แต่ onemancompany kernel ทำงานอยู่เบื้องหลัง
  Claude Code ไม่ใช่ core ของระบบ — เป็นแค่ interface
```

## 9.4 A2A Protocol (Phase 6)

```
Future compatibility layer:
  Agent Card export (capability advertisement)
  External agent discovery
  Task delegation ข้าม service
  Peer-to-peer agent communication

ออกแบบให้ compatible ตั้งแต่วันแรก:
  Internal Message Protocol → ใกล้เคียงกับ A2A message format
  Agent Registry format → สามารถ export เป็น Agent Card ได้
  แต่ยังไม่ implement จนกว่าจะถึง Phase 6
```

---

# PART 10: TECHNOLOGY STACK

## 10.1 Core Architecture Decision

```
Orchestration Layer:    TypeScript / Node.js
Calculation Layer:      Python
Configuration:          YAML + Markdown
Persistence:            SQLite
```

## 10.2 TypeScript (Company Kernel + Adapters + CLI)

```
เหตุผล:
  ✓ Type system บังคับ output schema ของ agent ได้ที่ compile time
  ✓ Zod: runtime validation ของ LLM output — ไม่มี silent wrong schema
  ✓ async/await + Promise.all: parallel agent execution เป็นธรรมชาติ
  ✓ spawn child_process: เรียก CLI (Gemini, Codex) ได้ง่าย
  ✓ MCP SDK เป็น TypeScript-first
  ✓ iterate เร็ว, tooling ดี
  ✓ schema sharing ระหว่าง kernel, validator, MCP

Key Libraries:
  zod               → runtime schema validation (CRITICAL)
  neverthrow        → functional error handling, ไม่มี silent fail
  commander         → CLI framework
  @modelcontextprotocol/sdk → MCP server
  drizzle-orm       → SQLite ORM (type-safe queries)
  better-sqlite3    → SQLite driver
  winston           → structured logging
  vitest            → unit testing
```

## 10.3 Python (Quant Module)

```
เหตุผล:
  ✓ DCF, reverse DCF, MOS table, sensitivity analysis: deterministic ไม่ใช่ LLM
  ✓ pandas, numpy: data manipulation
  ✓ Pydantic: input/output schema validation
  ✓ unit test ง่าย reproducible ทุกครั้ง
  ✓ ผลลัพธ์ตรวจสอบได้ vs LLM ที่อาจ compute ผิด

เชื่อมกับ TypeScript Kernel:
  ผ่าน subprocess call (CLI)
  หรือ local HTTP (FastAPI wrapper)

Key Libraries:
  pydantic          → schema validation
  pandas            → financial data manipulation
  numpy             → math
  pytest            → testing
  fastapi           → optional HTTP wrapper
```

## 10.4 YAML + Markdown

```
YAML: machine-readable config
  → Agent cards
  → Skill cards
  → Source registry
  → Model routing policy
  → Mission templates
  → Domain constitution

Markdown: human-readable + LLM-readable
  → Persona files (ส่งเป็น prompt context)
  → Skill instruction files
  → Evidence pack content
  → Final reports
```

## 10.5 SQLite

```
เหตุผล:
  ✓ local-first (ไม่ต้องมี cloud infrastructure)
  ✓ zero setup
  ✓ query ได้ด้วย SQL (ง่ายสำหรับ analysis)
  ✓ เพียงพอสำหรับ single-user system
  ✓ migrate ไป PostgreSQL ได้ง่ายถ้าจำเป็นในอนาคต

Tables:
  missions, agent_calls, messages, evidence_items,
  human_gates, debate_records, journal_entries,
  agent_scorecard, cost_tracking, health_logs
```

## 10.6 Project Structure

```
onemancompany/
├── packages/
│   ├── kernel/              ← TypeScript: Company Kernel
│   │   ├── src/
│   │   │   ├── state-machine.ts
│   │   │   ├── mission-planner.ts
│   │   │   ├── team-builder.ts
│   │   │   ├── context-manager.ts
│   │   │   ├── debate-controller.ts
│   │   │   ├── evidence-controller.ts
│   │   │   ├── synthesis-engine.ts
│   │   │   ├── constitution-enforcer.ts
│   │   │   ├── human-gate.ts
│   │   │   └── journal-writer.ts
│   │   └── tests/
│   │
│   ├── adapters/            ← TypeScript: Runtime Adapters
│   │   ├── src/
│   │   │   ├── claude.adapter.ts
│   │   │   ├── gemini.adapter.ts
│   │   │   ├── zai.adapter.ts
│   │   │   ├── codex.adapter.ts
│   │   │   ├── python.adapter.ts
│   │   │   ├── human.adapter.ts
│   │   │   └── mock.adapter.ts   ← สำคัญมากสำหรับ testing
│   │   └── tests/
│   │
│   ├── observability/       ← TypeScript: Logging + Audit
│   │   ├── src/
│   │   │   ├── structured-logger.ts
│   │   │   ├── mission-tracer.ts
│   │   │   ├── evidence-auditor.ts
│   │   │   ├── output-validator.ts
│   │   │   ├── replay-engine.ts
│   │   │   ├── health-monitor.ts
│   │   │   └── scorecard.ts
│   │   └── tests/
│   │
│   ├── cli/                 ← TypeScript: CLI interface
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   └── mcp-server/          ← TypeScript: MCP interface (Phase 4)
│       └── src/
│
├── apps/
│   └── quant/               ← Python: Financial calculations
│       ├── src/
│       │   ├── dcf.py
│       │   ├── reverse_dcf.py
│       │   ├── mos_table.py
│       │   ├── sensitivity.py
│       │   └── normalizer.py
│       └── tests/
│
├── domains/                 ← Domain configurations
├── registry/                ← Global registries
├── observability/           ← Logs, traces, journal DB
└── missions/                ← Mission data + replay storage
```

---

# PART 11: USE CASE — INVESTMENT WAR ROOM

## 11.1 Agent Roster

| Agent ID | Role | Persona | Primary Model | ทำอะไร |
|---|---|---|---|---|
| researcher-set | researcher | SET/SEC Expert | Gemini (long context) | ดึงข้อมูลจาก official sources |
| researcher-us | researcher | SEC/EDGAR Expert | Gemini | ดึงข้อมูล US stocks |
| forensic-accountant | analyst | Forensic Accountant | Claude | ตรวจคุณภาพกำไร แยก one-off |
| damodaran-valuation | analyst | Prof. Damodaran | Claude | DCF, reverse DCF, intrinsic value |
| klarman-downside | analyst | Seth Klarman | ZAI | Margin of safety, downside case |
| peter-lynch-story | analyst | Peter Lynch | ZAI | Business story, growth category |
| hf-manager | analyst | HF Institutional | Claude | Position sizing, institutional view |
| technical-analyst | analyst | Technical Trader | ZAI | Chart, key levels, setup |
| portfolio-allocator | analyst | Portfolio Manager | Claude | Portfolio fit, position sizing |
| pro-investor | analyst | Owner's Framework | Claude | Owner's personal checklist |
| cio-synthesizer | synthesizer | CIO | Claude | รวม outputs, final synthesis |
| book-master | document | Document Generator | Claude | สร้าง formal report |

## 11.2 Full Workflow

```
Owner: "วิเคราะห์ MCS ถ้าคิดกำไร Q1 เป็นฐาน 400 ล้าน, MOS > 30%"

[DRAFT → PLANNING]
  Mission Planner แตก objective, เลือกทีม, กำหนด evidence requirement
  Execution plan: researcher sequential, analysts parallel, CIO sequential

[PLANNING → RESEARCHING]
  researcher-set ทำงาน:
  ├── ดึง 56-1 Annual Report 2025
  ├── ดึง Q1-2026 quarterly filing
  ├── ดึง MD&A
  ├── ดึง Opportunity Day slides
  └── สร้าง Evidence Pack พร้อม [FACT] labels + Source Log

[RESEARCHING → HUMAN_REVIEW (Gate 1)]
  แสดง evidence summary ให้ owner
  "Found 5 sources (3 Tier-1). 1 data gap: capex detail not found"
  Owner: "proceed"

[HUMAN_REVIEW → ANALYZING] (parallel)
  forensic-accountant → ตรวจ Q1 profit เป็น one-off ไหม
  damodaran-valuation → DCF conservative/base/optimistic
  klarman-downside → downside scenario
  portfolio-allocator → portfolio fit analysis
  pro-investor → owner framework checklist

[ANALYZING → CROSS_QA]
  damodaran ส่ง evidence_request → researcher: "ต้องการ capex 5 ปี"
  klarman ส่ง question → forensic: "Q1 cashflow quality score?"
  researcher ตอบ: capex data + one data gap noted

[CROSS_QA → DEBATING]
  klarman challenges damodaran: "growth 12% สูงไปสำหรับ history 7.8%"
  damodaran responds with management guidance (Tier 2)
  Round 1: partial resolution → klarman accepts 10% as compromise
  Terminal growth unresolved: Damodaran 3% vs Klarman 2%

[DEBATING → SYNTHESIZING]
  CIO รวม outputs:
  ├── Agreement: normalized earnings ≈ 380-420M (forensic: 395M)
  ├── Agreement: FCF quality medium-high
  ├── Agreement: business moat moderate
  ├── Disagreement: terminal growth 2% vs 3% → surface to owner
  └── CIO fair value range: 28-34 THB (conservative-base)

[SYNTHESIZING → HUMAN_REVIEW (Gate 3)]
  แสดง synthesis ให้ owner
  Owner revises: "ผมยอมรับ growth 10%, terminal 2.5%"
  Owner: "proceed to decision"

[HUMAN_REVIEW → DECIDED]
  decision_state: WAIT_FOR_PRICE
  price_to_watch: 24.00 THB (MOS 30% ที่ conservative fair value 28.50)
  thesis_breakers: [Q2 earnings < 80M, major contract loss, founder sell]

[DECIDED → JOURNALED]
  เขียน journal entry ครบทุก field
  set follow-up: Q2 earnings release (Aug 2026)
```

## 11.3 Final Report Structure

```
Investment Report: MCS Medical (MCS.BK)
Analysis Date: 2026-05-11 | Mission ID: MCS-valuation-20260511-001

═══════════════════════════════════════════════════════
SECTION 1: ONE-PAGE DECISION SUMMARY
  Decision State:       WAIT_FOR_PRICE
  Current Price:        31.50 THB
  Price to Watch:       24.00 THB
  Conservative Value:   28.50 THB
  MOS at Today Price:   -10.5% (overpriced by 10.5%)
  Evidence Score:       72/100
  Conviction:           6/10

SECTION 2: BUSINESS MODEL
  [business description + segment data]

SECTION 3: EVIDENCE QUALITY
  [source log + data gaps + evidence score breakdown]

SECTION 4: NORMALIZED EARNINGS
  Reported Q1 2026: 105M THB
  One-off Items: -8M (FX gain), +3M (reversal)
  Normalized Q1: 100M THB → Annualized: 400M THB
  Cashflow Quality: Medium (OCF / Net Profit = 82%)
  Confidence: Medium

SECTION 5: CONSERVATIVE DCF
  [DCF table with assumptions clearly labeled]

SECTION 6: REVERSE DCF
  [what growth rate is priced in at current price]

SECTION 7: MOS TABLE
  Fair Value Conservative: 28.50 THB
  MOS 20% price:           22.80 THB
  MOS 30% price:           19.95 THB
  ← Price to Watch:        24.00 THB (owner-defined threshold)

SECTION 8: DOWNSIDE CASE
  [Klarman downside: if earnings normalize to 300M]

SECTION 9: ANALYST DISAGREEMENT
  [Damodaran vs Klarman on terminal growth — unresolved]

SECTION 10: DECISION STATE & THESIS BREAKERS
  [structured decision output]

SECTION 11: FOLLOW-UP CHECKLIST
  □ Q2 2026 earnings (Aug 2026) — verify normalized earnings
  □ Annual Report 2026 (Mar 2027) — capex plan update

SECTION 12: AUDIT TRAIL
  [link to mission trace + evidence audit trail]
```

---

# PART 12: DEVELOPMENT METHODOLOGY

## 12.1 หลักการพัฒนา

### Kernel ก่อน, LLM ทีหลัง

```
Mistake ที่ทุกคนทำ:
  เริ่มเขียน prompt → ค่อยสร้าง infrastructure

ถูกต้อง:
  สร้าง Kernel ให้ทำงานได้โดยไม่มี LLM เลยก่อน
  → ทดสอบ state machine ครบทุก path
  → verify error handling ทำงาน
  → verify journal เขียนได้
  ทั้งหมดนี้ด้วย Mock Adapters เท่านั้น
  ก่อนที่จะเรียก real LLM แม้แต่ครั้งเดียว
```

### Schema-First Development

```
ก่อนเขียน prompt ของแต่ละ agent:
  1. เขียน Zod output schema ก่อน
     "agent นี้ต้อง output อะไร"
     "field ไหน mandatory, optional"
     "type ของแต่ละ field"

  2. เขียน validation test ก่อน
     "ถ้า agent ไม่ output field X → reject หรือ retry?"
     "ถ้า conviction_level ไม่ใช่ 1-10 → ทำอะไร?"

  3. แล้วค่อยเขียน prompt
     prompt ต้องทำให้ LLM output ตรงตาม schema
     ไม่ใช่ schema ตาม LLM output

  เหตุผล:
     ถ้าไม่มี schema ก่อน → ระบบไม่รู้ว่า output "ถูก" คืออะไร
     → ไม่มีทางตรวจจับ hallucination หรือ missing fields
```

### Evidence-Grounding Test

```
สำหรับทุก agent ที่ทำ analysis:
  ทดสอบว่า: ตัวเลขสำคัญใน output มีใน evidence pack ไหม?

Test setup:
  1. สร้าง evidence pack จำลองที่มีตัวเลขที่รู้แน่
     revenue = 2,450M, profit = 400M, capex = 85M
  2. run agent กับ evidence pack นั้น
  3. ตรวจ output: ตัวเลข 2,450M อยู่ใน output ไหม?
  4. ถ้า output มีตัวเลขที่ไม่อยู่ใน evidence pack → FAIL (hallucination detected)
```

## 12.2 Build Order (สัปดาห์ต่อสัปดาห์)

```
Week 1-2: Phase 0 — Specification (ไม่มี code)
  □ นิยาม Mission State Machine formal
  □ เขียน output schema ของทุก agent (Zod schema)
  □ กำหนด Debate Protocol rules
  □ เขียน Company Constitution (investment domain)
  □ กำหนด Journal schema
  □ กำหนด Human Checkpoint rules
  □ ออกแบบ folder structure
  □ กำหนด Context Budget policy
  ผลลัพธ์: docs ทุกอย่าง spec พร้อม ยังไม่มี code

Week 3-4: Kernel Foundation (TypeScript, no LLM)
  □ Mission State Machine (ทุก state + transition + timeout)
  □ Mock Adapters สำหรับทุก backend
  □ Agent Registry loader (reads YAML)
  □ Skill Registry loader
  □ Company Constitution enforcer
  □ Context Manager (budget tracking logic)
  □ Decision Journal writer (SQLite)
  □ Structured logger
  □ Test: full mission lifecycle ด้วย mock data 100%
  ผลลัพธ์: kernel ทำงานครบโดยไม่เรียก LLM เลย

Week 5-6: Observability Layer
  □ Mission Tracer
  □ Agent Call Logger (full input/output storage)
  □ Evidence Audit Trail
  □ LLM Output Validator (Zod-based)
  □ Replay storage structure
  □ Health Monitor
  ผลลัพธ์: ทุกอย่างที่เกิดขึ้นใน kernel บันทึกและ queryable

Week 7-8: First Real Adapter + Researcher
  □ Gemini Adapter (real CLI call)
  □ researcher-set agent (persona + skills)
  □ Evidence Pack builder
  □ Test: researcher ดึง 56-1 จาก SET จริง
  □ Validate: output ผ่าน schema + grounding check
  ผลลัพธ์: pipeline ดึงข้อมูลจริงได้

Week 9-10: First Analyst Agents
  □ Claude Adapter (real API call)
  □ ZAI Adapter
  □ forensic-accountant agent
  □ damodaran-valuation agent
  □ Test: researcher → analysts pipeline
  □ Evidence grounding test ผ่าน
  ผลลัพธ์: 2 analysts ทำงานบน real evidence

Week 11-12: Full Analyst Team + Debate
  □ klarman-downside agent
  □ pro-investor agent (owner fills in persona)
  □ Parallel runner (run analysts simultaneously)
  □ Debate Controller (3-round protocol)
  □ Cross-QA (evidence request loop)
  ผลลัพธ์: full team ทำงาน, debate ทำงาน

Week 13-14: Synthesis + CLI + War Room MVP
  □ cio-synthesizer agent
  □ Human Gate (console-based)
  □ Full CLI interface
  □ Python quant module (DCF, MOS table)
  □ End-to-end test กับหุ้นจริง (APP, MCS, HMPRO)
  □ Journal ทำงาน
  ผลลัพธ์: Investment War Room MVP ทำงานได้จริง

```

## 12.3 Testing Strategy

```
Layer 1: Unit Tests (ไม่เรียก LLM)
  - State Machine transitions ทุก path
  - Constitution enforcer ทุก rule
  - Context Manager budget calculation
  - Debate Controller round resolution
  - Evidence score calculation
  - Journal writer schema validation

Layer 2: Schema Tests (ไม่เรียก LLM)
  - ทุก agent output schema ต้อง validate ได้
  - ทุก message type ต้อง validate ได้
  - ทุก journal entry ต้อง validate ได้

Layer 3: Fixture Tests (เรียก LLM ครั้งเดียว, บันทึกผล, reuse)
  - Run agent กับ test input จริง → save output เป็น fixture
  - ต่อไป test ด้วย fixture แทน (เร็วกว่า ไม่เสียเงิน)
  - update fixture เมื่อ output เปลี่ยนโดยตั้งใจ

Layer 4: Evidence Grounding Tests
  - สร้าง evidence pack จำลองที่รู้ตัวเลข
  - run analyst → ตรวจว่าตัวเลขมาจาก evidence
  - flag ถ้ามีตัวเลขที่ไม่มีใน evidence (hallucination detection)

Layer 5: End-to-End Tests (เรียก LLM จริง)
  - Full mission pipeline ด้วยหุ้น benchmark
  - ทดสอบ human gate
  - ทดสอบ failure recovery
  - ใช้ใน CI/CD หลังจาก deploy
```

---

# PART 13: PHASED ROADMAP

## Phase 0: Specification Freeze (ก่อน code)

```
เป้าหมาย: นิยามบริษัทให้ชัดก่อน coding เพราะ:
  "ถ้าเริ่ม code ก่อนนิยาย process ระบบจะกลายเป็น
   script เรียก AI หลายตัว ไม่ใช่บริษัท"

สิ่งที่ต้องทำ:
  □ เขียน PROJECT_CHARTER.md
  □ เขียน ARCHITECTURE.md (ฉบับสมบูรณ์)
  □ เขียน MISSION_LIFECYCLE.md (state machine formal)
  □ เขียน AGENT_MODEL.md (output schemas ทุก agent)
  □ เขียน DEBATE_PROTOCOL.md
  □ เขียน COMPANY_CONSTITUTION.md (investment domain)
  □ เขียน JOURNAL_SCHEMA.md
  □ เขียน EVIDENCE_STANDARD.md
  □ เขียน DOMAIN_TEMPLATE.md

ผลลัพธ์: ทีม (หรือ AI) ที่อ่าน docs เหล่านี้สามารถเริ่ม code ได้ทันที
```

## Phase 1: Kernel Core (TypeScript, no LLM)

```
เป้าหมาย: Company Kernel ทำงานสมบูรณ์โดยไม่ต้องเรียก LLM จริง

Deliverables:
  ✓ Mission State Machine (all states, transitions, timeouts)
  ✓ Mock Adapters (simulate all backends)
  ✓ Agent Registry loader
  ✓ Skill Registry loader
  ✓ Company Constitution enforcer
  ✓ Context Manager
  ✓ Decision Journal writer (SQLite)
  ✓ Observability Layer (logger, tracer, validator)
  ✓ Replay storage structure

Success Criteria:
  ✓ Full mission lifecycle runs end-to-end with mock data
  ✓ All state machine error paths handled
  ✓ Journal schema validates
  ✓ Constitution violations detected and logged
  ✓ 100% unit test coverage on kernel logic
```

## Phase 2: Adapter Layer + CLI

```
เป้าหมาย: เชื่อมต่อกับ AI backends จริง + CLI ใช้งานได้

Deliverables:
  ✓ All 4 adapters (Gemini, Claude, ZAI, Codex) — real calls
  ✓ Python Quant adapter
  ✓ Backend fallback chain
  ✓ Health Monitor (pre-session check)
  ✓ Full CLI interface (all commands)

Success Criteria:
  ✓ Single adapter runs correctly against real model
  ✓ Fallback activates when primary backend fails
  ✓ CLI ใช้งานได้ผ่าน Claude Code
  ✓ All calls logged with full context
```

## Phase 3: Investment War Room MVP

```
เป้าหมาย: ใช้กับหุ้นจริงได้ ผลลัพธ์ตรงกับ framework เจ้าของ

Deliverables:
  ✓ Full agent roster (8 agents)
  ✓ Evidence Pack generation (real sources)
  ✓ Parallel analyst execution
  ✓ Debate round (3-round protocol)
  ✓ CIO synthesis
  ✓ Python quant: DCF, reverse DCF, MOS table
  ✓ Human checkpoint (console-based)
  ✓ Decision Journal (writes after every mission)
  ✓ Evidence Audit Trail
  ✓ Full output report

Benchmark Stocks: APP, MCS, HMPRO, ACG, CPALL, SCGD

Success Criteria:
  ✓ Output ใกล้เคียง investment framework ของเจ้าของ
  ✓ ทุก FACT มี source tier ≥ 2
  ✓ MOS table ทุกครั้ง
  ✓ decision_state ชัดเจน
  ✓ thesis_breaker ระบุได้
  ✓ journal เขียนเองหลัง mission
  ✓ replay mission ได้
```

## Phase 4: MCP Interface

```
เป้าหมาย: Claude Code เรียก onemancompany เป็น tools ได้

Deliverables:
  ✓ MCP server (TypeScript)
  ✓ 8 MCP tools exposed
  ✓ Claude Code integration tested
  ✓ เจ้าของคุยกับ Claude Code → ระบบทำงานเบื้องหลัง

After this phase:
  Claude Code = boardroom interface
  onemancompany kernel = ระบบหลัง
```

## Phase 5: Enhanced Debate + Second Domain

```
เป้าหมาย:
  1. Debate protocol ครบทุก feature
  2. เปิด domain ที่สอง (ทดสอบ multi-domain)

Deliverables:
  ✓ Multi-round structured debate (full evidence request loop)
  ✓ Disagreement tracker + pattern analysis
  ✓ Second domain (research-studio หรือ content-studio)
  ✓ Confirm: kernel ไม่ต้องแก้เลยสำหรับ domain ใหม่
```

## Phase 6: A2A Compatible Runtime

```
เป้าหมาย: รองรับ agent ที่เป็น service จริงในอนาคต

Deliverables:
  ✓ Agent Card export
  ✓ Capability discovery
  ✓ A2A gateway
  ✓ External agent integration test
```

## Phase 7: Advanced Learning Loop

```
เป้าหมาย: ระบบเรียนรู้จากการตัดสินใจในอดีต

Deliverables:
  ✓ Outcome tracking system (thesis held or broken?)
  ✓ Pattern detection (mistakes clustering)
  ✓ Automatic surfacing ของ relevant past decisions
  ✓ Constitution refinement suggestions จาก lessons
  ✓ Agent quality trend analysis
```

---

# PART 14: RISK REGISTER & GUARDRAILS

| # | ความเสี่ยง | โอกาส | ผลกระทบ | Guardrail |
|---|---|---|---|---|
| R1 | Multi-agent hallucinate ด้วยกัน | สูง | วิกฤต | Evidence-first, grounding check, FACT tagging |
| R2 | Start coding before spec clear | สูงมาก | สูง | Phase 0 ต้อง complete ก่อน code บรรทัดแรก |
| R3 | Silent failure ของ agent | สูง | สูง | neverthrow, explicit error states, observable |
| R4 | Context overflow (ตัวเลข truncate) | กลาง | สูง | Context Manager, Smart Compressor |
| R5 | Debate loop ไม่มีวันจบ | กลาง | กลาง | Max 3 rounds, explicit resolution rules |
| R6 | Agent report เยอะ แต่ไม่มี decision | กลาง | สูง | Constitution: ทุก mission ต้องจบด้วย decision_state |
| R7 | Tool lock-in กับ Claude Code หรือ MCP | กลาง | กลาง | Core logic อยู่ใน kernel, ทุก interface เป็น adapter |
| R8 | CLI session หมด (Gemini/Codex) | สูง | กลาง | Health check ก่อนทุก session, auto-notify |
| R9 | Cost บาน (token usage) | กลาง | กลาง | Cost tracking per mission, context compression |
| R10 | Journal ไม่ได้เริ่ม ข้อมูลหาย | สูง | สูง | Journal schema ใน Phase 0, เขียนทุก mission |
| R11 | Kernel ซับซ้อนเกินไป ดูแลยาก | กลาง | กลาง | Single responsibility per component, test coverage |
| R12 | Owner over-rely ระบบไม่คิดเอง | กลาง | กลาง | Human gates บังคับ, system presents both sides |

---

# PART 15: SUCCESS CRITERIA

## 15.1 Technical Success (Phase 1-2)

```
□ Mission State Machine ผ่าน unit test 100%
□ ทุก error path handled อย่าง explicit (ไม่มี silent fail)
□ ทุก agent call บันทึกครบ (agent, model, tokens, latency, cost)
□ output schema validation ทุก agent
□ Constitution violations detected + logged
□ Mission replay ทำงาน
□ เพิ่ม adapter ใหม่ได้โดยไม่แตะ kernel
```

## 15.2 Investment Success (Phase 3)

```
□ Evidence-based analysis ทุกครั้ง (ไม่มี sourceless facts)
□ Normalized earnings ผ่าน forensic ก่อน valuation ทุกครั้ง
□ Conservative DCF + Reverse DCF ทุก mission
□ MOS table ทุกครั้ง
□ Downside case ทุกครั้ง
□ decision_state ชัดเจน ใช้ได้จริง
□ price_to_watch มีทุกครั้ง
□ thesis_breaker มีทุกครั้ง
□ journal เขียนหลัง mission อัตโนมัติ
□ Output ใกล้เคียง framework จริงของเจ้าของ
```

## 15.3 Design Success (All Phases)

```
□ เปลี่ยน model ของ agent ได้โดยไม่เปลี่ยน workflow
□ เพิ่ม agent ใหม่ได้โดยไม่แก้ kernel code
□ เพิ่ม domain ใหม่ได้ใน < 1 วัน (ด้วย domain.yaml)
□ Claude Code / Gemini / Codex / ZAI ล้วนเป็น swap-able backend
□ MCP / A2A / CLI เป็น interface ไม่ใช่ core
□ Owner สามารถ audit ทุก decision ได้ผ่าน observability
□ Mission replay ทำงานได้ (ย้อนดูว่าระบบคิดอะไร)
```

## 15.4 Experiential Success (ความรู้สึก)

```
เมื่อ Phase 3 เสร็จ เจ้าของควรรู้สึกว่า:

  "ฉันคุยกับทีมจริง ไม่ใช่ AI ตัวเดียว"
  "ทุก claim มีหลักฐาน ฉันรู้ว่ามาจากไหน"
  "ทีมถามกันเอง หาจุดอ่อนให้ฉัน"
  "ฉันยังอยู่ใน control — ระบบ pause ให้ฉัน confirm"
  "ผลลัพธ์ช่วยตัดสินใจได้จริง ไม่ใช่แค่รายงาน"
  "ฉัน audit ย้อนหลังได้ว่าทำไมถึงตัดสินใจแบบนั้น"
```

---

## Final Statement

```
onemancompany ไม่ใช่ระบบที่ AI หลายตัวมาตอบพร้อมกัน

มันเป็นบริษัทจำลองที่ทำให้คนหนึ่งคน
คิด ตัดสินใจ และลงมือได้เหมือนมีทีมจริง

โดยไม่ยึดติดกับ model, tool, protocol หรือ interface ใดเป็นศูนย์กลาง
และสามารถตรวจสอบทุกการตัดสินใจย้อนหลังได้เสมอ

The core asset is the Company Kernel:
  how missions are understood
  how agents are formed
  how evidence is controlled
  how disagreement is handled
  how decisions are made
  how learning is stored
  how everything is observed
```
