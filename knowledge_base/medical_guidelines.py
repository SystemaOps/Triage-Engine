"""
Sample medical knowledge base documents for the RAG pipeline.
These represent condensed clinical triage guidelines and red flag criteria.
In production, replace/extend with actual clinical guidelines (e.g., Manchester Triage System,
ESI triage protocols, WHO IMCI guidelines).
"""

MEDICAL_DOCUMENTS = [
    {
        "id": "chest_pain_01",
        "title": "Chest Pain Triage Guidelines",
        "content": """
Chest pain triage protocol:
EMERGENCY (call 999/911 immediately):
- Crushing, squeezing, or pressure-like chest pain radiating to arm, jaw, neck, or back
- Chest pain with diaphoresis (sweating), nausea, or vomiting
- Suspected STEMI: ST-elevation on ECG, troponin rise
- Chest pain with hypotension (BP < 90/60 mmHg), syncope, or altered consciousness
- Aortic dissection signs: tearing/ripping pain radiating to back, unequal blood pressures
- Pulmonary embolism signs: pleuritic chest pain, hemoptysis, tachycardia, O2 saturation below 94%
- Tension pneumothorax: sudden unilateral chest pain, absent breath sounds, tracheal deviation

URGENT CARE (within 1-4 hours):
- New onset atypical chest pain without high-risk features
- Pericarditis: sharp pleuritic pain, positional, better when leaning forward
- Costochondritis: reproducible with palpation, no cardiac risk factors

DOCTOR CONSULTATION (within 24 hours):
- Recurrent chest wall pain, low risk features
- GERD-related chest discomfort

Red flags: radiation to arm/jaw, diaphoresis, syncope, SpO2 < 94%, BP < 90/60 mmHg, HR > 120 bpm
        """,
        "category": "cardiovascular"
    },
    {
        "id": "respiratory_01",
        "title": "Respiratory Distress Triage Guidelines",
        "content": """
Respiratory distress triage protocol:
EMERGENCY:
- SpO2 < 90% on room air (severe hypoxia)
- Respiratory rate > 30 breaths/min in adults
- Cyanosis (blue/grey lips or fingertips)
- Use of accessory muscles, nasal flaring, intercostal retractions
- Stridor (high-pitched breathing) suggesting upper airway obstruction
- Anaphylaxis with bronchospasm: urticaria, angioedema, wheezing after allergen exposure
- Acute severe asthma: unable to speak in sentences, silent chest, PEFR < 33%
- Epiglottitis: drooling, tripod positioning, muffled voice, high fever

URGENT CARE:
- Moderate asthma: wheezing, breathlessness, SpO2 92-95%
- Community-acquired pneumonia with fever, productive cough, localized crackles
- Moderate COPD exacerbation: increased breathlessness, purulent sputum

DOCTOR CONSULTATION:
- Mild URTI with mild shortness of breath
- Non-severe cough lasting > 3 weeks without systemic symptoms

Red flags: SpO2 < 90%, central cyanosis, RR > 30/min, stridor, silent chest
        """,
        "category": "respiratory"
    },
    {
        "id": "neurological_01",
        "title": "Neurological Emergency Triage Guidelines",
        "content": """
Neurological triage protocol:
EMERGENCY:
- Stroke (FAST): Facial drooping, Arm weakness, Speech difficulty, Time to call 911
- Sudden severe headache ("thunderclap") — worst headache of life: rule out subarachnoid hemorrhage
- Seizure with altered consciousness, status epilepticus (seizure > 5 minutes)
- Meningitis signs: neck stiffness, photophobia, petechial rash (non-blanching), fever > 38.5°C
- Altered level of consciousness (GCS < 14), confusion, agitation
- TIA symptoms resolving but persisting neurological deficits
- Spinal cord compression: bilateral weakness, loss of bladder/bowel control

URGENT CARE:
- First seizure with no prior history, now alert
- Severe migraine unresponsive to standard therapy
- Sudden visual loss or diplopia (double vision)
- Vertigo with vomiting, inability to walk

DOCTOR CONSULTATION:
- Recurrent tension headaches
- Stable, chronic dizziness without new features

Red flags: sudden worst headache, facial droop, unilateral weakness, speech changes, non-blanching rash
        """,
        "category": "neurology"
    },
    {
        "id": "abdominal_01",
        "title": "Abdominal Pain Triage Guidelines",
        "content": """
Abdominal pain triage protocol:
EMERGENCY:
- Ruptured aortic aneurysm: sudden tearing abdominal/back pain, pulsatile mass, hemodynamic instability
- Peritonitis: rigid abdomen, guarding, rebound tenderness, fever, sepsis signs
- Ectopic pregnancy: lower abdominal pain, missed period, shoulder tip pain, hemodynamic instability
- Bowel obstruction with strangulation: absent bowel sounds, distension, vomiting
- Mesenteric ischemia: severe pain out of proportion to examination, atrial fibrillation history
- Septic shock from abdominal source: fever/hypothermia, tachycardia, hypotension, altered consciousness

URGENT CARE:
- Appendicitis: right iliac fossa pain, nausea, fever, rebound tenderness
- Cholecystitis: RUQ pain, Murphy's sign, fever, nausea after fatty meal
- Pancreatitis: severe epigastric pain radiating to back, history of alcohol use or gallstones
- Renal colic: severe loin-to-groin pain, hematuria, nausea/vomiting

DOCTOR CONSULTATION:
- Mild epigastric discomfort, GERD
- IBS flare without alarming features

Red flags: rigid abdomen, hemodynamic instability, missed period with pain, fever with peritoneal signs
        """,
        "category": "gastrointestinal"
    },
    {
        "id": "vitals_interpretation_01",
        "title": "Vital Signs Interpretation for Triage",
        "content": """
Vital signs triage thresholds for adults:

HEART RATE (HR):
- Normal: 60-100 bpm
- Concerning tachycardia: > 100 bpm (investigate cause)
- Severe tachycardia (URGENT/EMERGENCY): > 120 bpm at rest
- Bradycardia (URGENT): < 50 bpm with symptoms (dizziness, syncope, hypotension)

BLOOD PRESSURE (BP):
- Normal: 90-140 / 60-90 mmHg
- Hypertensive urgency: SBP 180-219 / DBP 110-119 with no target organ damage → Urgent care
- Hypertensive emergency: SBP ≥ 220 or DBP ≥ 120 with symptoms (headache, vision changes, chest pain) → EMERGENCY
- Hypotension (EMERGENCY): SBP < 90 mmHg — signs of shock

OXYGEN SATURATION (SpO2):
- Normal: 95-100%
- Mild hypoxia (monitor): 92-94% → Urgent care
- Moderate hypoxia: 90-92% → Urgent/Emergency
- Severe hypoxia (EMERGENCY): < 90%

TEMPERATURE:
- Normal: 36.1-37.2°C (97-99°F)
- Low-grade fever: 37.3-38.0°C → Self-care/GP if isolated
- Fever (Doctor): 38.0-39.0°C
- High fever (Urgent): 39.0-40.0°C
- Hyperpyrexia (EMERGENCY): > 40°C or fever with altered consciousness/rash
- Hypothermia (EMERGENCY): < 35°C

Shock signs (EMERGENCY): tachycardia + hypotension + altered consciousness + pallor/diaphoresis
        """,
        "category": "vital_signs"
    },
    {
        "id": "pediatric_01",
        "title": "Pediatric Triage Red Flags",
        "content": """
Pediatric triage guidelines (children under 12):
EMERGENCY:
- Infant < 3 months with fever > 38°C — always emergency
- Inconsolable cry, high-pitched cry in infants
- Bulging fontanelle in infants
- Mottled, pale, blue, or grey skin
- Severe respiratory distress: grunting, nasal flaring, severe retractions
- Seizures in a child never previously diagnosed with epilepsy
- Non-blanching rash (petechiae/purpura) — rule out meningococcal disease
- Decreased level of consciousness, unresponsive
- Signs of dehydration in infants: sunken fontanelle, no tears, no wet diapers for 8+ hours

URGENT CARE:
- Child with fever > 39°C without source and age 3-36 months
- Croup: barking cough, stridor at rest
- Febrile convulsion (first episode, resolved)
- Moderate dehydration: dry mucous membranes, decreased urine output

Red flags in children: bulging fontanelle, non-blanching rash, fever in neonate, grunting respiration
        """,
        "category": "pediatrics"
    },
    {
        "id": "mental_health_01",
        "title": "Mental Health and Psychiatric Triage",
        "content": """
Mental health triage guidelines:
EMERGENCY:
- Active suicidal ideation with plan and means
- Self-harm with significant physical injury requiring medical treatment
- Psychosis with aggression or danger to self/others
- Acute drug or alcohol intoxication with loss of consciousness or respiratory depression
- Severe agitation, violent or threatening behavior
- Neuroleptic malignant syndrome: hyperthermia, rigidity, altered consciousness (on antipsychotics)
- Serotonin syndrome: agitation, clonus, hyperthermia, tachycardia (on serotonergic drugs)

URGENT CARE:
- Suicidal ideation without immediate plan or means — needs same-day psychiatric assessment
- Acute panic attack with first presentation
- Severe acute anxiety with physical symptoms (palpitations, chest pain)
- Acute psychotic episode, first presentation, not acutely dangerous

DOCTOR CONSULTATION:
- Worsening depression with passive suicidal thoughts (no plan)
- Anxiety disorder, medication review

Red flags: active plan for suicide, psychosis with agitation, NMS or serotonin syndrome signs
        """,
        "category": "mental_health"
    },
    {
        "id": "sepsis_01",
        "title": "Sepsis Recognition and Triage",
        "content": """
Sepsis triage protocol — Time critical condition:
EMERGENCY — Suspected Sepsis (qSOFA ≥ 2 or SIRS criteria met with suspected infection):
qSOFA criteria (quick Sequential Organ Failure Assessment):
- Altered mental status (GCS < 15)
- Respiratory rate ≥ 22/min
- Systolic BP ≤ 100 mmHg

SIRS criteria (≥ 2 of the following with suspected infection):
- Temperature > 38°C or < 36°C
- HR > 90 bpm
- RR > 20/min
- WBC > 12,000 or < 4,000

Septic shock (EMERGENCY — highest priority):
- Sepsis + vasopressor requirement + lactate > 2 mmol/L after fluid resuscitation

Common sepsis sources: pneumonia, UTI, intra-abdominal, skin/soft tissue, meningitis
Sepsis 6 bundle (start within 1 hour): blood cultures, IV antibiotics, IV fluids, lactate, urine output, O2

Red flags for sepsis: fever/hypothermia + tachycardia + hypotension + altered consciousness + source of infection
        """,
        "category": "sepsis"
    },
    {
        "id": "allergic_reaction_01",
        "title": "Allergic Reactions and Anaphylaxis Triage",
        "content": """
Allergic reaction triage:
EMERGENCY — Anaphylaxis (requires immediate epinephrine + 999/911):
Diagnosis: sudden onset after allergen exposure with ≥ 2 of:
- Skin/mucosal symptoms: urticaria, flushing, angioedema
- Respiratory compromise: dyspnea, wheeze, stridor, hypoxia
- Cardiovascular: hypotension, syncope, tachycardia
- GI symptoms: vomiting, cramping

High-risk features:
- Throat/tongue swelling (angioedema) — airway compromise risk
- Known nut, insect sting, or latex allergy with systemic symptoms
- SpO2 dropping, stridor, unable to speak

URGENT CARE:
- Severe localized allergic reaction (urticaria without systemic signs)
- Angioedema limited to face without airway involvement
- Allergic reaction in patient with prescribed epinephrine who used it (needs observation)

SELF-CARE / DOCTOR:
- Mild urticaria, known trigger, responding to oral antihistamine
- Contact dermatitis

Red flags: stridor, throat swelling, hypotension, SpO2 drop after allergen exposure — always emergency
        """,
        "category": "allergy"
    },
    {
        "id": "trauma_01",
        "title": "Trauma and Injury Triage Guidelines",
        "content": """
Trauma triage protocol:
EMERGENCY (major trauma — activate trauma team):
- Mechanism: high-speed MVA, fall from height > 3m, penetrating torso/head injury
- Airway compromise, GCS < 14
- Respiratory rate < 10 or > 29
- Systolic BP < 90 mmHg
- Suspected spinal cord injury: bilateral weakness, sensory loss, bowel/bladder dysfunction
- Traumatic brain injury (TBI): loss of consciousness, amnesia, vomiting, focal deficit
- Open fractures or suspected pelvic fracture with hemodynamic instability
- Tension pneumothorax: absent breath sounds, tracheal deviation, hypotension

URGENT CARE:
- Isolated long bone fractures (femur, humerus) — closed, hemodynamically stable
- Head injury: brief LOC but now GCS 15, no focal deficit, no anticoagulants
- Burns < 10% BSA, not face/hands/genitals/circumferential

DOCTOR CONSULTATION:
- Minor lacerations needing sutures
- Soft tissue injury, minor contusions, suspected simple fractures (hand, wrist)

Red flags: penetrating injury, altered GCS, hemodynamic instability, spinal cord signs
        """,
        "category": "trauma"
    },
]
