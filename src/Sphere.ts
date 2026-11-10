export interface SphereMesh {
  positions: Float32Array;
  indices: Uint16Array;
}

export const createSphereMesh = (): SphereMesh => {
  const longitudeDivisions = 24;
  const latitudeDivisions = 12;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let latitude = 0; latitude <= latitudeDivisions; latitude++) {
    const theta = Math.PI * latitude / latitudeDivisions;

    for (let longitude = 0; longitude <= longitudeDivisions; longitude++) {
      const phi = 2 * Math.PI * longitude / longitudeDivisions;

      positions.push(
        Math.sin(theta) * Math.cos(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi)
      );
    }
  }

  for (let latitude = 0; latitude < latitudeDivisions; latitude++) {
    for (let longitude = 0; longitude < longitudeDivisions; longitude++) {
      const v1 = latitude * (longitudeDivisions + 1) + longitude;
      const v2 = v1 + 1;
      const v3 = v1 + longitudeDivisions + 1;
      const v4 = v3 + 1;

      if (latitude > 0) {
        indices.push(v1, v2, v3);
      }
      if (latitude < latitudeDivisions - 1) {
        indices.push(v2, v4, v3);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices)
  };
}