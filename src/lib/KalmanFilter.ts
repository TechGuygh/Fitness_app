export class KalmanFilter {
  private Q: number; // process noise
  private R: number; // measurement noise
  private P: number; // estimation error covariance
  private F: number; // measurement matrix (for 1D, F=1)
  private H: number; // observation matrix (for 1D, H=1)
  private x: number | null; // value
  private initialized: boolean = false;

  constructor(Q: number = 0.00001, R: number = 0.0001, P: number = 1) {
    this.Q = Q;
    this.R = R;
    this.P = P;
    this.F = 1;
    this.H = 1;
    this.x = null;
  }

  filter(measurement: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return this.x;
    }

    // Prediction
    this.P = this.F * this.P * this.F + this.Q;

    // Measurement update
    const K = this.P * this.H / (this.H * this.P * this.H + this.R); // Kalman gain
    this.x = this.x! + K * (measurement - this.H * this.x!);
    this.P = (1 - K * this.H) * this.P;

    return this.x;
  }
}
