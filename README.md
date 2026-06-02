# Gyroscope API Demo

A small demo of the Gyroscope API using a 3D model.

*[Live Demo](https://ctx-0.github.io/gyroscope/)*


## Modes

**Gyroscope mode** uses `Gyroscope`. It reads angular velocity from `x`, `y`, and `z` in radians per second, then integrates those values over time to rotate the model. This is relative motion, so it can drift.

**Absolute mode** uses `AbsoluteOrientationSensor`. It reads a quaternion from the browser and applies that orientation directly to the model. This is absolute orientation from sensor fusion, usually accelerometer, gyroscope, and magnetometer.

    TL;DR
    Gyroscope:
    - gives spin speed
    - needs dt integration
    - relative
    - drifts

    AbsoluteOrientationSensor:
    - gives final orientation
    - uses quaternion directly
    - absolute
    - more stable, but depends on sensor fusion

## Model

Low-poly 3D Bocchi model used here:
[bottiボーン無し](https://3d.nicovideo.jp/works/td87197)  FBX format with texture
Thanks for creating this model!

## License

MIT
