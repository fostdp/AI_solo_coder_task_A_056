import asyncio
import aiohttp
import numpy as np
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
import time
import random

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [5G-SIM] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)


class FiveGSimulatorConfig:
    BASE_URL = "http://localhost:8000"
    API_PREFIX = "/api/v1"
    VIBRATION_ENDPOINT = f"{BASE_URL}{API_PREFIX}/data/ingest/vibration"
    THERMAL_ENDPOINT = f"{BASE_URL}{API_PREFIX}/data/ingest/thermal"

    VIBRATION_SENSORS = [f"VB-{i:03d}" for i in range(60)]
    THERMAL_CAMERAS = [f"TH-{i:03d}" for i in range(20)]

    SAMPLING_RATE_HZ = 2000
    WINDOW_SECONDS = 5
    SAMPLES_PER_BATCH = SAMPLING_RATE_HZ * WINDOW_SECONDS

    REPORT_INTERVAL_SECONDS = 3600
    FAST_MODE_INTERVAL_SECONDS = 10

    SURFACE_MAP = {
        "VB-000": "C096-N", "VB-001": "C096-N", "VB-002": "C096-N", "VB-003": "C096-N",
        "VB-004": "C096-N", "VB-005": "C096-N", "VB-006": "C096-N", "VB-007": "C096-N",
        "VB-008": "C096-N", "VB-009": "C096-N",
        "VB-010": "C096-S", "VB-011": "C096-S", "VB-012": "C096-S", "VB-013": "C096-S",
        "VB-014": "C096-S", "VB-015": "C096-S", "VB-016": "C096-S", "VB-017": "C096-S",
        "VB-018": "C096-S", "VB-019": "C096-S",
        "VB-020": "C096-E", "VB-021": "C096-E", "VB-022": "C096-E", "VB-023": "C096-E",
        "VB-024": "C096-E", "VB-025": "C096-E", "VB-026": "C096-E", "VB-027": "C096-E",
        "VB-028": "C096-W", "VB-029": "C096-W", "VB-030": "C096-W", "VB-031": "C096-W",
        "VB-032": "C096-W", "VB-033": "C096-W", "VB-034": "C096-W", "VB-035": "C096-W",
        "VB-036": "C096-C", "VB-037": "C096-C", "VB-038": "C096-C", "VB-039": "C096-C",
        "VB-040": "C257-N", "VB-041": "C257-N", "VB-042": "C257-N", "VB-043": "C257-N",
        "VB-044": "C257-S", "VB-045": "C257-S", "VB-046": "C257-S",
        "VB-047": "C257-E", "VB-048": "C257-E", "VB-049": "C257-W", "VB-050": "C257-W",
        "VB-051": "C285-N", "VB-052": "C285-N", "VB-053": "C285-N", "VB-054": "C285-N",
        "VB-055": "C285-S", "VB-056": "C285-S", "VB-057": "C285-S",
        "VB-058": "C285-N", "VB-059": "C285-N",
    }

    DELAMINATION_SURFACES = ["C096-N", "C257-N", "C285-N"]


class VibrationSignalGenerator:
    def __init__(self, n_samples: int, fs: float = 2000.0):
        self.n_samples = n_samples
        self.fs = fs
        self.t = np.linspace(0, n_samples / fs, n_samples, endpoint=False)

    def generate_healthy(self, seed: Optional[int] = None) -> Dict[str, List[float]]:
        if seed is not None:
            rng = np.random.RandomState(seed)
        else:
            rng = np.random.RandomState()

        modes = [
            (2.5, 0.003, 0.012),
            (7.8, 0.002, 0.008),
            (15.3, 0.0015, 0.015),
            (22.1, 0.001, 0.010),
            (31.0, 0.0008, 0.018),
        ]

        x = np.zeros(self.n_samples)
        y = np.zeros(self.n_samples)
        z = np.zeros(self.n_samples)

        for freq, amp, phase in modes:
            phase_x = phase * rng.uniform(0.8, 1.2)
            phase_y = phase * rng.uniform(0.8, 1.2) + 0.3
            phase_z = phase * rng.uniform(0.8, 1.2) + 0.6
            amp_f = amp * rng.uniform(0.7, 1.3)

            x += amp_f * np.sin(2 * np.pi * freq * self.t + phase_x)
            y += amp_f * 0.8 * np.sin(2 * np.pi * freq * self.t + phase_y)
            z += amp_f * 0.6 * np.sin(2 * np.pi * freq * self.t + phase_z)

        x += rng.normal(0, 0.0008, self.n_samples)
        y += rng.normal(0, 0.0008, self.n_samples)
        z += rng.normal(0, 0.0008, self.n_samples)

        micro_tremor = 0.0003 * np.sin(2 * np.pi * 0.2 * self.t + rng.uniform(0, np.pi))
        x += micro_tremor
        y += micro_tremor * 0.7
        z += micro_tremor * 0.5

        return {
            "x": x.tolist(),
            "y": y.tolist(),
            "z": z.tolist(),
        }

    def generate_delaminated(
        self,
        severity: float = 0.3,
        seed: Optional[int] = None,
    ) -> Dict[str, List[float]]:
        if seed is not None:
            rng = np.random.RandomState(seed)
        else:
            rng = np.random.RandomState()

        severity = np.clip(severity, 0.05, 0.95)
        freq_shift_factor = 1.0 - 0.02 - severity * 0.08
        amp_enhance_factor = 1.0 + severity * 2.5
        noise_enhance = 1.0 + severity * 3.0

        base_modes = [
            (2.5 * freq_shift_factor, 0.003 * amp_enhance_factor, 0.012),
            (7.8 * freq_shift_factor, 0.002 * amp_enhance_factor, 0.008),
            (15.3 * freq_shift_factor, 0.0015 * amp_enhance_factor, 0.015),
            (22.1 * freq_shift_factor, 0.001 * amp_enhance_factor, 0.010),
            (31.0 * freq_shift_factor, 0.0008 * amp_enhance_factor, 0.018),
        ]

        extra_modes = []
        if severity > 0.2:
            extra_modes.append((4.2 * freq_shift_factor, 0.002 * amp_enhance_factor * severity * 2, rng.uniform(0, np.pi)))
        if severity > 0.4:
            extra_modes.append((11.5 * freq_shift_factor, 0.0015 * amp_enhance_factor * severity * 1.5, rng.uniform(0, np.pi)))
        if severity > 0.6:
            extra_modes.append((18.7 * freq_shift_factor, 0.0012 * amp_enhance_factor * severity, rng.uniform(0, np.pi)))

        all_modes = base_modes + extra_modes

        x = np.zeros(self.n_samples)
        y = np.zeros(self.n_samples)
        z = np.zeros(self.n_samples)

        for freq, amp, phase in all_modes:
            phase_x = phase * rng.uniform(0.8, 1.2)
            phase_y = phase * rng.uniform(0.8, 1.2) + 0.3
            phase_z = phase * rng.uniform(0.8, 1.2) + 0.6
            amp_f = amp * rng.uniform(0.7, 1.3)

            x += amp_f * np.sin(2 * np.pi * freq * self.t + phase_x)
            y += amp_f * 0.8 * np.sin(2 * np.pi * freq * self.t + phase_y)
            z += amp_f * 0.6 * np.sin(2 * np.pi * freq * self.t + phase_z)

        x += rng.normal(0, 0.0008 * noise_enhance, self.n_samples)
        y += rng.normal(0, 0.0008 * noise_enhance, self.n_samples)
        z += rng.normal(0, 0.0008 * noise_enhance, self.n_samples)

        impact_times = rng.choice(
            self.n_samples,
            size=int(severity * 15),
            replace=False,
        )
        for it in impact_times:
            decay_len = min(200, self.n_samples - it)
            idx = np.arange(decay_len)
            impact = 0.005 * severity * np.exp(-idx / 30) * np.sin(2 * np.pi * 120 * idx / self.fs)
            x[it:it + decay_len] += impact
            y[it:it + decay_len] += impact * 0.7
            z[it:it + decay_len] += impact * 0.5

        return {
            "x": x.tolist(),
            "y": y.tolist(),
            "z": z.tolist(),
        }


class ThermalImageGenerator:
    def __init__(self, resolution: tuple = (64, 48)):
        self.width, self.height = resolution

    def generate(
        self,
        camera_id: str,
        base_temp: float = 20.0,
        has_hotspot: bool = False,
        hotspot_severity: float = 0.3,
    ) -> Dict:
        x = np.linspace(-1, 1, self.width)
        y = np.linspace(-1, 1, self.height)
        X, Y = np.meshgrid(x, y)

        temp_matrix = np.full((self.height, self.width), base_temp)
        temp_matrix += 0.5 * np.sin(X * 3) * np.cos(Y * 2)
        temp_matrix += np.random.normal(0, 0.15, (self.height, self.width))

        hotspot_regions = []
        if has_hotspot:
            n_hotspots = max(1, int(hotspot_severity * 4))
            for hs in range(n_hotspots):
                hx = np.random.uniform(-0.7, 0.7)
                hy = np.random.uniform(-0.7, 0.7)
                h_radius = np.random.uniform(0.1, 0.3 + hotspot_severity * 0.2)
                h_amp = 3.0 + hotspot_severity * 7.0

                dist_sq = (X - hx) ** 2 + (Y - hy) ** 2
                hotspot = h_amp * np.exp(-dist_sq / (2 * h_radius ** 2))
                temp_matrix += hotspot

                hotspot_regions.append({
                    "id": f"HS-{hs:03d}",
                    "center_x_rel": float(hx),
                    "center_y_rel": float(hy),
                    "radius_rel": float(h_radius),
                    "max_temp_delta": float(h_amp),
                    "area_pct": round(float(np.mean(dist_sq < h_radius ** 2) * 100), 2),
                })

        temp_matrix = np.clip(temp_matrix, -5, 60)

        return {
            "camera_id": camera_id,
            "temperature_matrix": temp_matrix.round(3).tolist(),
            "max_temp": round(float(np.max(temp_matrix)), 3),
            "min_temp": round(float(np.min(temp_matrix)), 3),
            "avg_temp": round(float(np.mean(temp_matrix)), 3),
            "hotspot_regions": hotspot_regions,
        }


class FiveGNetworkSimulator:
    def __init__(self, fast_mode: bool = True):
        self.config = FiveGSimulatorConfig()
        self.interval = (
            self.config.FAST_MODE_INTERVAL_SECONDS
            if fast_mode
            else self.config.REPORT_INTERVAL_SECONDS
        )
        self.vibration_gen = VibrationSignalGenerator(
            n_samples=self.config.SAMPLES_PER_BATCH,
            fs=self.config.SAMPLING_RATE_HZ,
        )
        self.thermal_gen = ThermalImageGenerator()

        self.vib_severity_map: Dict[str, float] = {}
        for sid in self.config.VIBRATION_SENSORS:
            surface = self.config.SURFACE_MAP.get(sid, "")
            if surface in self.config.DELAMINATION_SURFACES:
                self.vib_severity_map[sid] = random.uniform(0.15, 0.65)
            else:
                self.vib_severity_map[sid] = random.uniform(0.0, 0.08)

        self.thermal_hotspot_map: Dict[str, float] = {}
        for cid in self.config.THERMAL_CAMERAS:
            if random.random() < 0.35:
                self.thermal_hotspot_map[cid] = random.uniform(0.1, 0.5)

    async def send_vibration_batch(self, session: aiohttp.ClientSession, batch_idx: int) -> bool:
        timestamp = datetime.now(timezone.utc).isoformat()
        sensors_data = {}

        for sensor_id in self.config.VIBRATION_SENSORS:
            severity = self.vib_severity_map[sensor_id]
            drift_factor = 1.0 + 0.0001 * batch_idx * random.uniform(-1, 1)
            severity = np.clip(severity * drift_factor, 0, 0.95)
            self.vib_severity_map[sensor_id] = severity

            seed_base = hash(sensor_id + str(batch_idx)) % (2 ** 31)

            if severity > 0.08:
                signal = self.vibration_gen.generate_delaminated(
                    severity=severity,
                    seed=seed_base,
                )
            else:
                signal = self.vibration_gen.generate_healthy(seed=seed_base)

            sensors_data[sensor_id] = signal

        payload = {
            "timestamp": timestamp,
            "sensors": sensors_data,
        }

        latency = random.uniform(8, 35)
        await asyncio.sleep(latency / 1000.0)

        try:
            async with session.post(
                self.config.VIBRATION_ENDPOINT,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120),
                headers={"X-5G-Edge-Node": "DUNHUANG-MOGAO-EDGE-01"},
            ) as resp:
                if resp.status == 200:
                    body = await resp.json()
                    logger.info(
                        f"[批次#{batch_idx:04d}] 振动数据上报成功 | 5G延迟={latency:.1f}ms "
                        f"| 传感器={body.get('records_stored', 0)}台"
                    )
                    return True
                else:
                    logger.warning(
                        f"[批次#{batch_idx:04d}] 振动数据上报失败: HTTP {resp.status}"
                    )
                    return False
        except Exception as e:
            logger.error(f"[批次#{batch_idx:04d}] 振动数据上报异常: {e}")
            return False

    async def send_thermal_batch(self, session: aiohttp.ClientSession, batch_idx: int) -> int:
        timestamp = datetime.now(timezone.utc).isoformat()
        success = 0

        for ci, camera_id in enumerate(self.config.THERMAL_CAMERAS):
            severity = self.thermal_hotspot_map.get(camera_id, 0.0)
            base_temp = 18.0 + random.uniform(-2, 5)

            img = self.thermal_gen.generate(
                camera_id=camera_id,
                base_temp=base_temp,
                has_hotspot=severity > 0,
                hotspot_severity=severity,
            )
            img["timestamp"] = timestamp

            packet_loss = random.random() < 0.005
            if packet_loss:
                logger.info(f"  模拟5G丢包: 热成像相机 {camera_id}")
                continue

            try:
                async with session.post(
                    self.config.THERMAL_ENDPOINT,
                    json=img,
                    timeout=aiohttp.ClientTimeout(total=60),
                    headers={"X-5G-Edge-Node": "DUNHUANG-MOGAO-EDGE-01"},
                ) as resp:
                    if resp.status == 200:
                        success += 1
            except Exception as e:
                logger.warning(f"热成像 {camera_id} 上报异常: {e}")

            await asyncio.sleep(random.uniform(2, 8) / 1000.0)

        logger.info(
            f"[批次#{batch_idx:04d}] 热成像上报完成 {success}/{len(self.config.THERMAL_CAMERAS)} 台"
        )
        return success

    async def run(self, num_batches: Optional[int] = None):
        logger.info("=" * 70)
        logger.info("5G数据上报模拟器启动")
        logger.info(f"  振动传感器: {len(self.config.VIBRATION_SENSORS)} 台")
        logger.info(f"  热成像相机: {len(self.config.THERMAL_CAMERAS)} 台")
        logger.info(f"  采样频率: {self.config.SAMPLING_RATE_HZ} Hz")
        logger.info(f"  窗口长度: {self.config.WINDOW_SECONDS}s ({self.config.SAMPLES_PER_BATCH} 采样点)")
        logger.info(f"  上报间隔: {self.interval}s ({'快速模式' if self.interval < 60 else '实际模式'})")
        logger.info(f"  上报端点: {self.config.VIBRATION_ENDPOINT}")
        logger.info(f"  剥离模拟墙面: {self.config.DELAMINATION_SURFACES}")
        logger.info("=" * 70)

        batch_idx = 0
        async with aiohttp.ClientSession() as session:
            while True:
                batch_idx += 1
                logger.info(f"\n>>> 开始5G数据上报批次 #{batch_idx:04d} @ {datetime.now().strftime('%H:%M:%S')}")

                vib_task = asyncio.create_task(self.send_vibration_batch(session, batch_idx))
                therm_task = asyncio.create_task(self.send_thermal_batch(session, batch_idx))

                await asyncio.gather(vib_task, therm_task, return_exceptions=True)

                logger.info(f"<<< 批次 #{batch_idx:04d} 完成，等待 {self.interval}s 后下一次上报")

                if num_batches and batch_idx >= num_batches:
                    logger.info(f"已完成指定 {num_batches} 个上报批次，模拟器退出")
                    break

                await asyncio.sleep(self.interval)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="莫高窟壁画监测5G数据上报模拟器")
    parser.add_argument(
        "--mode",
        choices=["fast", "real"],
        default="fast",
        help="fast=每10秒上报一次 (调试), real=每3600秒上报一次 (实际)",
    )
    parser.add_argument(
        "--batches",
        type=int,
        default=None,
        help="指定上报批次数量后退出 (默认无限循环)",
    )
    parser.add_argument(
        "--endpoint",
        type=str,
        default=None,
        help="自定义后端API端点 (默认 http://localhost:8000)",
    )
    args = parser.parse_args()

    if args.endpoint:
        FiveGSimulatorConfig.BASE_URL = args.endpoint.rstrip("/")
        FiveGSimulatorConfig.VIBRATION_ENDPOINT = f"{FiveGSimulatorConfig.BASE_URL}{FiveGSimulatorConfig.API_PREFIX}/data/ingest/vibration"
        FiveGSimulatorConfig.THERMAL_ENDPOINT = f"{FiveGSimulatorConfig.BASE_URL}{FiveGSimulatorConfig.API_PREFIX}/data/ingest/thermal"

    fast_mode = args.mode == "fast"
    simulator = FiveGNetworkSimulator(fast_mode=fast_mode)

    try:
        asyncio.run(simulator.run(num_batches=args.batches))
    except KeyboardInterrupt:
        logger.info("\n用户中断，模拟器停止")


if __name__ == "__main__":
    main()
