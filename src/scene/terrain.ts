import {
  Credit,
  Ellipsoid,
  Event,
  HeightmapTerrainData,
  Request,
  TerrainProvider,
  WebMercatorTilingScheme,
  type TerrainData,
  type TileAvailability,
} from 'cesium'
import { MAX_LEVEL, TILE_SIZE, loadHeightTile } from './terrarium'

// Terrain straight from the public terrarium tiles, no ion account needed.
// A 256px tile is more than the mesh needs; every second sample is enough.
const GRID = 129
const ALL_CHILDREN = 15

export class TerrariumTerrainProvider implements TerrainProvider {
  readonly errorEvent = new Event<TerrainProvider.ErrorEvent>()
  readonly credit = new Credit(
    'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a> (Mapzen, SRTM, EU-DEM et al.)',
  )
  readonly tilingScheme = new WebMercatorTilingScheme({ ellipsoid: Ellipsoid.WGS84 })
  readonly hasWaterMask = false
  readonly hasVertexNormals = false
  readonly availability: TileAvailability | undefined = undefined

  private readonly levelZeroError = TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
    Ellipsoid.WGS84,
    GRID,
    this.tilingScheme.getNumberOfXTilesAtLevel(0),
  )

  requestTileGeometry(x: number, y: number, level: number, request?: Request): Promise<TerrainData> | undefined {
    const tile = loadHeightTile(x, y, level, request)
    if (!tile) return undefined
    return tile.then(({ heights }) => {
      const buffer = new Float32Array(GRID * GRID)
      const step = (TILE_SIZE - 1) / (GRID - 1)
      for (let row = 0; row < GRID; row++) {
        const sy = Math.round(row * step) * TILE_SIZE
        for (let col = 0; col < GRID; col++) {
          buffer[row * GRID + col] = heights[sy + Math.round(col * step)]!
        }
      }
      return new HeightmapTerrainData({
        buffer,
        width: GRID,
        height: GRID,
        childTileMask: level < MAX_LEVEL ? ALL_CHILDREN : 0,
      })
    })
  }

  getLevelMaximumGeometricError(level: number): number {
    return this.levelZeroError / (1 << level)
  }

  getTileDataAvailable(_x: number, _y: number, level: number): boolean | undefined {
    return level <= MAX_LEVEL
  }

  loadTileDataAvailability(): undefined {
    return undefined
  }
}
