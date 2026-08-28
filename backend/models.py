from sqlalchemy import Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from database import Base


class Satellite(Base):
    __tablename__ = "satellites"

    norad_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    operator: Mapped[str | None] = mapped_column(String(200))
    category: Mapped[str | None] = mapped_column(String(100))
    is_reflective: Mapped[bool] = mapped_column(Boolean, default=True)
    launched_at: Mapped[str | None] = mapped_column(String(20))
    source: Mapped[str | None] = mapped_column(String(50))  # "celestrak" | "horizons"

    reflection_events: Mapped[list["ReflectionEvent"]] = relationship(back_populates="satellite")


class Telescope(Base):
    __tablename__ = "telescopes"

    telescope_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    alt_m: Mapped[float] = mapped_column(Float, nullable=False)
    operator: Mapped[str | None] = mapped_column(String(200))

    reflection_events: Mapped[list["ReflectionEvent"]] = relationship(back_populates="telescope")


class ReflectionEvent(Base):
    __tablename__ = "reflection_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    norad_id: Mapped[int] = mapped_column(Integer, ForeignKey("satellites.norad_id"), nullable=False)
    telescope_id: Mapped[str] = mapped_column(String(20), ForeignKey("telescopes.telescope_id"), nullable=False)
    event_time: Mapped[str] = mapped_column(String(30), nullable=False)   # ISO 8601 UTC
    duration_s: Mapped[int | None] = mapped_column(Integer)
    angle_deg: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[str] = mapped_column(String(30), server_default=func.now())

    satellite: Mapped["Satellite"] = relationship(back_populates="reflection_events")
    telescope: Mapped["Telescope"] = relationship(back_populates="reflection_events")


class FovCrossingEvent(Base):
    __tablename__ = "fov_crossing_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    norad_id: Mapped[int] = mapped_column(Integer, ForeignKey("satellites.norad_id"), nullable=False)
    telescope_id: Mapped[str] = mapped_column(String(20), ForeignKey("telescopes.telescope_id"), nullable=False)
    event_time: Mapped[str] = mapped_column(String(30), nullable=False)
    duration_s: Mapped[int | None] = mapped_column(Integer)
    separation_deg: Mapped[float | None] = mapped_column(Float)
    boresight_az_deg: Mapped[float | None] = mapped_column(Float)
    boresight_el_deg: Mapped[float | None] = mapped_column(Float)
    fov_deg: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[str] = mapped_column(String(30), server_default=func.now())

    satellite: Mapped["Satellite"] = relationship()
    telescope: Mapped["Telescope"] = relationship()
