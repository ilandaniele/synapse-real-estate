/** Builds a minimal IFC4 file: one site, one IfcBuilding per name, each holding one 10 x 8 x 6 m extruded box. */
export function buildIfc(buildingNames: string[], options: { orphanBox?: boolean } = {}): Uint8Array {
  let next = 100;
  const lines: string[] = [];
  const add = (entity: string) => {
    const id = next++;
    lines.push(`#${id}=${entity};`);
    return `#${id}`;
  };
  const guid = () => `'${String(next).padStart(22, "0")}'`;

  const origin = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const up = add("IFCDIRECTION((0.,0.,1.))");
  const east = add("IFCDIRECTION((1.,0.,0.))");
  const world = add(`IFCAXIS2PLACEMENT3D(${origin},${up},${east})`);
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
  const metre = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const unitsAssignment = add(`IFCUNITASSIGNMENT((${metre}))`);
  const project = add(`IFCPROJECT(${guid()},$,'Demo',$,$,$,$,(${context}),${unitsAssignment})`);
  const sitePlacement = add(`IFCLOCALPLACEMENT($,${world})`);
  const site = add(`IFCSITE(${guid()},$,'Site',$,$,${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`);
  add(`IFCRELAGGREGATES(${guid()},$,$,$,${project},(${site}))`);

  const box = (container: string, index: number) => {
    const corner = add(`IFCCARTESIANPOINT((${index * 20}.,0.,0.))`);
    const placement = add(`IFCLOCALPLACEMENT(${sitePlacement},${add(`IFCAXIS2PLACEMENT3D(${corner},$,$)`)})`);
    const profileCenter = add(`IFCAXIS2PLACEMENT2D(${add("IFCCARTESIANPOINT((5.,4.))")},$)`);
    const profile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${profileCenter},10.,8.)`);
    const solid = add(`IFCEXTRUDEDAREASOLID(${profile},${world},${up},6.)`);
    const body = add(`IFCSHAPEREPRESENTATION(${context},'Body','SweptSolid',(${solid}))`);
    const shape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${body}))`);
    const element = add(`IFCBUILDINGELEMENTPROXY(${guid()},$,'Body ${index + 1}',$,$,${placement},${shape},$,$)`);
    add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid()},$,$,$,(${element}),${container})`);
  };

  const buildings = buildingNames.map((name, index) => {
    const building = add(`IFCBUILDING(${guid()},$,'${name}',$,$,${sitePlacement},$,$,.ELEMENT.,$,$,$)`);
    box(building, index);
    return building;
  });
  if (buildings.length > 0) add(`IFCRELAGGREGATES(${guid()},$,$,$,${site},(${buildings.join(",")}))`);
  if (options.orphanBox) box(site, buildingNames.length);

  const text = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    "FILE_NAME('fixture.ifc','2026-11-18T00:00:00',(''),(''),'','','');",
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    ...lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
  ].join("\n");
  return new TextEncoder().encode(text);
}
