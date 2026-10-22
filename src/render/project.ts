/**
 * 配准：地理坐标 → 画布坐标。
 *
 * 优先使用实例登记里的 georef——它与既有底图 source-map.svg 共用同一套
 * 局部等距投影，这样数据层绘制的建筑、场地、门线与底图几何能严丝合缝。
 * 没有 georef 时退化为外框等比拟合，仅用于没有底图的合成示例。
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
  const georef = registration.georef

  if (georef) {
    const toCanvas = ([lng, lat]: LngLat): LngLat => [
      (lng - georef.originLon0) * georef.metersPerDegree * georef.cosLat0 + georef.xOffsetM,
      georef.yOffsetM - (lat - georef.originLat0) * georef.metersPerDegree,
    ]

    const corners = [
      toCanvas([registration.overlayBounds.southWest.lng, registration.overlayBounds.southWest.lat]),
      toCanvas([registration.overlayBounds.northEast.lng, registration.overlayBounds.northEast.lat]),
    ]

    return {
      scale: 1,
      viewport: {
        x: Math.min(corners[0]![0], corners[1]![0]),
        y: Math.min(corners[0]![1], corners[1]![1]),
        width: Math.abs(corners[1]![0] - corners[0]![0]),
        height: Math.abs(corners[1]![1] - corners[0]![1]),
      },
      toCanvas,
    }
  }

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
      offsetY + (northEast.lat - lat) * metersPerLat * scale,
    ],
  }
}
