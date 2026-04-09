-- Enable PostGIS extension for geospatial data
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create zones table
CREATE TABLE zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  naam TEXT NOT NULL,
  soort TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT NOT NULL,
  toepassingen TEXT,
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  photos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create index on geometry for faster spatial queries
CREATE INDEX zones_geometry_idx ON zones USING GIST(geometry);

-- Create index on type for faster filtering
CREATE INDEX zones_type_idx ON zones(type);

-- Enable Row Level Security
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read zones (for visitor mode)
CREATE POLICY "Anyone can view zones"
  ON zones FOR SELECT
  USING (true);

-- Allow anyone to insert/update/delete zones (since we're using password auth in the app)
CREATE POLICY "Anyone can insert zones"
  ON zones FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update zones"
  ON zones FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete zones"
  ON zones FOR DELETE
  USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_zones_updated_at
  BEFORE UPDATE ON zones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create a view for easy GeoJSON export
CREATE OR REPLACE VIEW zones_geojson AS
SELECT 
  jsonb_build_object(
    'type', 'Feature',
    'id', id,
    'properties', jsonb_build_object(
      'id', id::text,
      'naam', naam,
      'soort', soort,
      'type', type,
      'color', color,
      'toepassingen', toepassingen,
      'photos', photos,
      'created_at', created_at,
      'updated_at', updated_at
    ),
    'geometry', ST_AsGeoJSON(geometry)::jsonb
  ) as feature
FROM zones;
