// Every feel number lives here. Open the game with ?dev to tune them live.
export const T = {
  // ground movement (m/s, m/s²)
  walkSpeed: 1.6,
  trotSpeed: 3.4,
  runSpeed: 5.6,
  accel: 26,
  decel: 20,
  airAccel: 11,
  turnRate: 8,

  // jumping
  gravity: 26,
  fallGravityMul: 1.3,
  apexGravityMul: 0.55,
  apexBand: 1.4,
  jumpCutMul: 2.0,
  maxFall: 16,
  jumpVel: 8.4,
  doubleJumpVel: 7.6,
  coyoteTime: 0.12,
  jumpBuffer: 0.15,

  // paw
  bapReach: 0.55,
  bapRadius: 0.45,
  bapImpulse: 1.6,
  bapLift: 0.9,
  bapCooldown: 0.26,

  // smoke
  thinHoldTime: 0.22,
  thinSpeedMul: 0.55,
  floatBackTime: 1.4,

  // camera
  camDistance: 3.5,
  camPitch: 0.34,
  camHeight: 0.5,
  camLag: 10,
  camAutoYaw: 5,
  camDragGrace: 0.35,
  camDragSpeed: 0.006,
};
export type Tuning = typeof T;
