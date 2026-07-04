/* ============================================================
   SECTION 1: CONSTANTS & EXERCISE CATALOG
   ============================================================ */

/** Muscle group taxonomy used for volume tracking & recovery flags. */
const MUSCLE_GROUPS = ["chest","back","shoulders","biceps","triceps","quads","hamstrings","glutes","calves","core","conditioning"];

/**
 * ExerciseCatalog — preset machines & cardio equipment.
 * @typedef {Object} CatalogItem
 * @property {string} id - unique slug
 * @property {string} name
 * @property {string[]} muscles - primary first
 * @property {"pin"|"plate"|"fixed"|"cardio"} loadType
 * @property {number} defaultIncrement - kg jump between progression steps (ignored for cardio)
 * @property {string} info - short (<=3 line) form cue / mistake / purpose
 * @property {[number,number]} repRange - target rep range (n/a for cardio)
 */
const CATALOG = [
  {id:"leg_press", name:"Leg press", muscles:["quads","glutes","hamstrings"], loadType:"plate", defaultIncrement:10, repRange:[8,12],
    info:"Primarily quads/glutes. Cue: feet shoulder-width, don't let knees cave in. Mistake: locking knees hard at top — keep a soft bend."},
  {id:"lat_pulldown", name:"Lat pulldown", muscles:["back","biceps"], loadType:"pin", defaultIncrement:5, repRange:[8,12],
    info:"Targets lats/upper back. Cue: pull elbows down and back, lead with elbows not hands. Mistake: leaning back excessively to cheat the pull."},
  {id:"chest_press", name:"Chest press machine", muscles:["chest","triceps"], loadType:"pin", defaultIncrement:5, repRange:[8,12],
    info:"Targets chest/front shoulder/triceps. Cue: keep shoulder blades pinned back. Mistake: flaring elbows to 90 degrees stresses the shoulder."},
  {id:"seated_row", name:"Seated cable row", muscles:["back","biceps"], loadType:"plate", defaultIncrement:5, repRange:[8,12],
    info:"Mid-back thickness. Cue: drive elbows past your ribs, squeeze shoulder blades. Mistake: using torso momentum instead of back muscles."},
  {id:"shoulder_press_m", name:"Shoulder press machine", muscles:["shoulders","triceps"], loadType:"pin", defaultIncrement:5, repRange:[8,12],
    info:"Front/side delts. Cue: press straight up, don't arch your lower back. Mistake: partial reps that skip the bottom stretch."},
  {id:"leg_curl", name:"Seated leg curl", muscles:["hamstrings"], loadType:"pin", defaultIncrement:5, repRange:[10,15],
    info:"Isolates hamstrings. Cue: squeeze at full contraction, control the release. Mistake: hips rising off the pad to cheat the weight."},
  {id:"leg_extension", name:"Leg extension", muscles:["quads"], loadType:"pin", defaultIncrement:5, repRange:[10,15],
    info:"Isolates quads. Cue: slight pause at the top, slow negative. Mistake: swinging the weight up using momentum."},
  {id:"pec_deck", name:"Pec deck / fly", muscles:["chest"], loadType:"pin", defaultIncrement:5, repRange:[10,15],
    info:"Chest isolation, stretch-focused. Cue: slight bend in elbows throughout. Mistake: slamming the handles together — control the squeeze."},
  {id:"cable_row_low", name:"Cable rows (low)", muscles:["back","biceps"], loadType:"plate", defaultIncrement:5, repRange:[8,12],
    info:"Similar to seated row, different angle. Cue: keep chest tall through the pull."},
  {id:"smith_squat", name:"Smith machine squat", muscles:["quads","glutes"], loadType:"plate", defaultIncrement:10, repRange:[6,10],
    info:"Fixed bar path squat. Cue: feet slightly forward of the bar path since it moves vertically. Mistake: same stance as free squat — adjust foot position."},
  {id:"hip_thrust_m", name:"Hip thrust machine", muscles:["glutes","hamstrings"], loadType:"plate", defaultIncrement:10, repRange:[8,12],
    info:"Glute-dominant. Cue: chin tucked, drive through heels, full lockout squeeze."},
  {id:"calf_raise_m", name:"Calf raise machine", muscles:["calves"], loadType:"pin", defaultIncrement:5, repRange:[12,20],
    info:"Cue: full stretch at bottom, pause at top. Mistake: bouncing through a tiny range of motion."},
  {id:"cable_bicep", name:"Cable bicep curl", muscles:["biceps"], loadType:"plate", defaultIncrement:2.5, repRange:[8,12],
    info:"Cue: elbows pinned to sides, no swinging. Mistake: using shoulders to heave the weight up."},
  {id:"tricep_pushdown", name:"Tricep pushdown", muscles:["triceps"], loadType:"plate", defaultIncrement:2.5, repRange:[10,15],
    info:"Cue: elbows locked at your sides, full extension. Mistake: leaning over the bar with body weight."},
  {id:"ab_crunch_m", name:"Ab crunch machine", muscles:["core"], loadType:"pin", defaultIncrement:5, repRange:[12,20],
    info:"Cue: curl the ribcage down, don't just pull with arms. Mistake: yanking the handles using arm strength."},
  {id:"treadmill", name:"Treadmill", muscles:["conditioning"], loadType:"cardio", defaultIncrement:0, repRange:null,
    info:"Log time, distance, and incline/speed. Great low-impact conditioning."},
  {id:"stationary_bike", name:"Stationary bike", muscles:["conditioning"], loadType:"cardio", defaultIncrement:0, repRange:null,
    info:"Low joint-impact cardio. Log time and resistance level."},
  {id:"rower", name:"Rowing machine", muscles:["conditioning","back"], loadType:"cardio", defaultIncrement:0, repRange:null,
    info:"Full-body conditioning. Cue: legs-back-arms on the drive, arms-back-legs on the return."},
  {id:"stairmill", name:"Stairmill", muscles:["conditioning","glutes"], loadType:"cardio", defaultIncrement:0, repRange:null,
    info:"High-intensity lower body conditioning. Log time and level."},
  {id:"elliptical", name:"Elliptical", muscles:["conditioning"], loadType:"cardio", defaultIncrement:0, repRange:null,
    info:"Low-impact cardio, good on recovery days. Log time and resistance level."}
];

const SPLIT_PRESETS = {
  full_body:{label:"Full body", days:["Full body A","Full body B","Full body C"]},
  upper_lower:{label:"Upper / Lower", days:["Upper","Lower"]},
  ppl:{label:"Push / Pull / Legs", days:["Push","Pull","Legs"]},
  custom:{label:"Custom", days:[]}
};

const STORAGE_KEY = "ironlog_data_v1";

/** A1: Increment this whenever the persisted schema changes structure. */
const SCHEMA_VERSION = 1;
