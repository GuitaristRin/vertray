/**
 * 配准：地理坐标 → 画布坐标。
 *
 * 用局部等距投影后再等比缩放，而不是把经纬度直接拉伸到 viewBox：
 * 后者在画布长宽比与地理范围不一致时会改变东西与南北的相对尺度，
 * 看起来不歪，量出来是错的。
 */
import type { LngLat, Registration } from "../types.ts"

const METERS_PER_DEGREE_LAT = 111_132

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export interface Projector {
  /** 每米对应的画布单位。 */
  scale: number
  /** 画布内的实际绘图区域。 */
  viewport: { x: number; y: number; width: number; height: number }
  toCanvas: (point: LngLat) => LngLat
}

export function createProjector(registration: Registration): Projector {
  const { width, height } = registration.canvas
  const { southWest, northEast } = registration.overlayBounds

  const latitude = (southWest.lat + northEast.lat) / 2
  const metersPerLng = 111_320 * Math.cos(toRadians(latitude))
  const metersPerLat = METERS_PER_DEGREE_LAT

  const spanX = (northEast.lng - southWest.lng) * metersPerLng
  const spanY = (northEast.lat - southWest.lat) * metersPerLat
  const scale = Math.min(width / spanX, height / spanY)

  const drawWidth = spanX * scale
  const drawHeight = spanY * scale
  const offsetX = (width - drawWidth) / 2
  const offsetY = (height - drawHeight) / 2

  return {
    scale,
    viewport: { x: offsetX, y: offsetY, width: drawWidth, height: drawHeight },
    toCanvas: ([lng, lat]) => [
      offsetX + (lng - southWest.lng) * metersPerLng * scale,
      // 纬度高对应画布上方，所以 y 取反。
      offsetY + (northEast.lat - lat) * metersPerLat * scale,
    ],
  }
}
