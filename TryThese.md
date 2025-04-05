Things to try when I'm on my pc again:

###Thought thing


async def get_all(self, session: AsyncSession, limit: Optional[int] = None, offset: Optional[int] = None) -> List[T]:
    """Get all records with optional pagination."""
    stmt = select(self.table).order_by(self.table.c.timestamp)
    
    if limit is not None:
        stmt = stmt.limit(limit)
    if offset is not None:
        stmt = stmt.offset(offset)
    
    print(f"Executing query: {stmt}")    
    result = await session.execute(stmt)
    rows = result.mappings().all()
    print(f"Query returned {len(rows)} rows")
    
    models = [self._dict_to_model(self._map_row_to_dict(row_map)) for row_map in rows]
    print(f"Converted to {len(models)} models")
    return models
