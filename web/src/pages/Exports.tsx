import { baseUrl } from "@/api/baseUrl";
import ExportCard from "@/components/card/ExportCard";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import useKeyboardListener from "@/hooks/use-keyboard-listener";
import { useSearchEffect } from "@/hooks/use-overlay-state";
import { cn } from "@/lib/utils";
import { DeleteClipType, Export } from "@/types/export";
import { FrigateConfig } from "@/types/frigateConfig";
import axios from "axios";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { LuChevronDown, LuClock3, LuFolderX } from "react-icons/lu";
import { isMobile } from "react-device-detect";
import { useTranslation } from "react-i18next";

import { endOfDay, format, startOfDay } from "date-fns";
import { toast } from "sonner";
import useSWR from "swr";

const toLocalInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

const toEpochSeconds = (value: string) =>
  value ? Math.round(new Date(value).getTime() / 1000) : NaN;

const formatDisplayDateTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return format(date, "PP p");
};

type DateTimePickerProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: string;
  min?: string;
};

const DateTimePicker = ({ id, label, value, onChange, max, min }: DateTimePickerProps) => {
  const selectedDate = value ? new Date(value) : new Date();
  const minDate = min ? startOfDay(new Date(min)) : undefined;
  const maxDate = max ? endOfDay(new Date(max)) : undefined;

  const handleDateSelect = (date?: Date) => {
    if (!date) return;
    const updated = new Date(date);
    updated.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
    onChange(toLocalInput(updated));
  };

  const handleTimeChange = (time: string) => {
    const [hours, minutes] = time.split(":").map((v) => parseInt(v, 10));
    const updated = new Date(selectedDate);
    updated.setHours(hours || 0, minutes || 0, 0, 0);
    onChange(toLocalInput(updated));
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={id}
            type="datetime-local"
            value={value}
            min={min}
            max={max}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="w-full"
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="justify-between sm:w-52"
                aria-label={label}
              >
                <div className="flex items-center gap-2">
                  <LuClock3 className="text-muted-foreground" />
                  <span className="truncate text-left">
                    {value ? formatDisplayDateTime(value) : label}
                  </span>
                </div>
                <LuChevronDown className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="start">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  initialFocus
                  disabled={(date) =>
                    (minDate ? date < minDate : false) ||
                    (maxDate ? date > maxDate : false)
                  }
                />
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {label}
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={String(selectedDate.getHours())}
                      onValueChange={(value) =>
                        handleTimeChange(`${value.padStart(2, "0")}:${format(selectedDate, "mm")}`)
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue aria-label="Hour" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {hours.map((hour) => (
                          <SelectItem key={hour} value={String(hour)}>
                            {hour.toString().padStart(2, "0")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(selectedDate.getMinutes())}
                      onValueChange={(value) =>
                        handleTimeChange(`${format(selectedDate, "HH")}:${value.padStart(2, "0")}`)
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue aria-label="Minutes" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {minutes.map((minute) => (
                          <SelectItem key={minute} value={String(minute)}>
                            {minute.toString().padStart(2, "0")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};

function Exports() {
  const { t } = useTranslation(["views/exports"]);
  const { data: exports, mutate } = useSWR<Export[]>("exports");
  const { data: config } = useSWR<FrigateConfig>("config");
  const [showBuilder, setShowBuilder] = useState<boolean>(!isMobile);
  const [camera, setCamera] = useState<string>();
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");
  const [exportName, setExportName] = useState<string>("");
  const [playback, setPlayback] = useState<string>("1");
  const [customPlayback, setCustomPlayback] = useState<string>("50");
  const [playbackSource, setPlaybackSource] = useState<string>("recordings");
  const [eventId, setEventId] = useState<string>("");
  const [fallbackCommand, setFallbackCommand] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const previewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t]);

  useEffect(() => {
    if (config && !camera) {
      setCamera(Object.keys(config.cameras)[0]);
    }

    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);

    setRangeStart(toLocalInput(start));
    setRangeEnd(toLocalInput(end));
  }, [camera, config]);

  // Search

  const [search, setSearch] = useState("");

  const filteredExports = useMemo(() => {
    if (!search || !exports) {
      return exports;
    }

    return exports.filter((exp) =>
      exp.name
        .toLowerCase()
        .replaceAll("_", " ")
        .includes(search.toLowerCase()),
    );
  }, [exports, search]);

  // Viewing

  const [selected, setSelected] = useState<Export>();
  const [selectedAspect, setSelectedAspect] = useState(0.0);

  useSearchEffect("id", (id) => {
    if (!exports) {
      return false;
    }

    setSelected(exports.find((exp) => exp.id == id));
    return true;
  });

  // Deleting

  const [deleteClip, setDeleteClip] = useState<DeleteClipType | undefined>();

  const onHandleDelete = useCallback(() => {
    if (!deleteClip) {
      return;
    }

    axios.delete(`export/${deleteClip.file}`).then((response) => {
      if (response.status == 200) {
        setDeleteClip(undefined);
        mutate();
      }
    });
  }, [deleteClip, mutate]);

  // Renaming

  const onHandleRename = useCallback(
    (id: string, update: string) => {
      axios
        .patch(`export/${id}/rename`, {
          name: update,
        })
        .then((response) => {
          if (response.status === 200) {
            setDeleteClip(undefined);
            mutate();
          }
        })
        .catch((error) => {
          const errorMessage =
            error.response?.data?.message ||
            error.response?.data?.detail ||
            "Unknown error";
          toast.error(t("toast.error.renameExportFailed", { errorMessage }), {
            position: "top-center",
          });
        });
    },
    [mutate, t],
  );

  const buildPlayback = useCallback(() => {
    const multiplier =
      playback === "custom" ? parseInt(customPlayback) : parseInt(playback);

    if (!multiplier || multiplier <= 1) {
      return { playbackValue: "realtime", multiplier: 1 };
    }

    return {
      playbackValue: `timelapse_${multiplier}x`,
      multiplier,
    };
  }, [customPlayback, playback]);

  const loadEventRange = useCallback(
    (id: string) => {
      if (!id) {
        return;
      }

      axios
        .get(`events/${id}`)
        .then((response) => {
          const event = response.data;
          if (!event?.start_time) {
            toast.error(t("eventMissingTime"));
            return;
          }

          const start = new Date(event.start_time * 1000);
          const end = new Date(
            (event.end_time ?? event.start_time + 60) * 1000,
          );
          if (event.camera) {
            setCamera(event.camera);
          }
          setRangeStart(toLocalInput(start));
          setRangeEnd(toLocalInput(end));
        })
        .catch(() => toast.error(t("eventLoadFailed")));
    },
    [t],
  );

  const applyQuickRange = useCallback(
    (type: "last24" | "today" | "sunrise" | "sunset" | "swap") => {
      const now = new Date();
      const baseDate = rangeEnd ? new Date(rangeEnd) : now;

      const sunriseHour = 6;
      const sunsetHour = 18;

      const applySunWindow = (startHour: number, endHour: number) => {
        const start = new Date(baseDate);
        const end = new Date(baseDate);
        start.setHours(startHour, 0, 0, 0);
        end.setHours(endHour, 0, 0, 0);

        if (now < start) {
          start.setDate(start.getDate() - 1);
          end.setDate(end.getDate() - 1);
        }

        setRangeStart(toLocalInput(start));
        setRangeEnd(toLocalInput(end));
      };

      switch (type) {
        case "last24": {
          const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          setRangeStart(toLocalInput(start));
          setRangeEnd(toLocalInput(now));
          break;
        }
        case "today": {
          const start = new Date(now);
          start.setHours(0, 0, 0, 0);
          setRangeStart(toLocalInput(start));
          setRangeEnd(toLocalInput(now));
          break;
        }
        case "sunrise": {
          applySunWindow(sunriseHour, sunsetHour);
          break;
        }
        case "sunset": {
          applySunWindow(sunsetHour, 23);
          break;
        }
        case "swap": {
          if (!rangeStart || !rangeEnd) return;
          setRangeStart(rangeEnd);
          setRangeEnd(rangeStart);
          break;
        }
      }
    },
    [rangeEnd, rangeStart],
  );

  const copyFallback = useCallback((command: string) => {
    navigator.clipboard?.writeText(command);
    toast.success(t("copiedCommand"));
  }, [t]);

  const handleStartExport = useCallback(() => {
    if (!camera) {
      toast.error(t("missingCamera"));
      return;
    }

    const startSeconds = toEpochSeconds(rangeStart);
    const endSeconds = toEpochSeconds(rangeEnd);

    if (
      Number.isNaN(startSeconds) ||
      Number.isNaN(endSeconds) ||
      endSeconds <= startSeconds
    ) {
      toast.error(t("invalidRange"));
      return;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (startSeconds > nowSeconds || endSeconds > nowSeconds) {
      toast.error(t("rangeInFuture"));
      return;
    }

    const { playbackValue, multiplier } = buildPlayback();
    const source = playbackSource === "preview" ? "preview" : "recordings";

    setFallbackCommand("");

    axios
      .post(
        `export/${camera}/start/${startSeconds}/end/${endSeconds}`,
        {
          playback: playbackValue,
          source,
          name: exportName,
        },
      )
      .then((response) => {
        if (response.status == 200) {
          toast.success(t("exportStarted"), {
            position: "top-center",
          });
          mutate();
        }
      })
      .catch((error) => {
        const errorMessage =
          error.response?.data?.message ||
          error.response?.data?.detail ||
          "Unknown error";
        toast.error(t("exportFailed", { errorMessage }), {
          position: "top-center",
        });

        if (
          playbackValue.startsWith("timelapse_") &&
          (error.response?.status === 422 || error.response?.status === 400)
        ) {
          const playlistUrl = `${baseUrl}vod/${camera}/start/${startSeconds}/end/${endSeconds}/index.m3u8`;
          const fallback =
            `ffmpeg -hide_banner -y -protocol_whitelist file,http,tcp -i "${playlistUrl}" ` +
            `-vf "setpts=PTS/${multiplier}" -r 30 -movflags +faststart ${camera}_${multiplier}x.mp4`;
          setFallbackCommand(fallback);
        }
      });
  }, [
    buildPlayback,
    camera,
    exportName,
    mutate,
    playbackSource,
    rangeEnd,
    rangeStart,
    t,
  ]);

  const handlePreview = useCallback(() => {
    if (!camera) {
      toast.error(t("missingCamera"));
      return;
    }

    const startSeconds = toEpochSeconds(rangeStart);
    const endSeconds = toEpochSeconds(rangeEnd);

    if (
      Number.isNaN(startSeconds) ||
      Number.isNaN(endSeconds) ||
      endSeconds <= startSeconds
    ) {
      toast.error(t("invalidRange"));
      return;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (startSeconds > nowSeconds || endSeconds > nowSeconds) {
      toast.error(t("rangeInFuture"));
      setPreviewUrl("");
      return;
    }

    const playlistUrl = `${baseUrl}vod/${camera}/start/${startSeconds}/end/${endSeconds}/index.m3u8`;
    setPreviewUrl(playlistUrl);
  }, [camera, rangeEnd, rangeStart, t]);

  useEffect(() => {
    if (!previewUrl || !previewRef.current) return;

    const video = previewRef.current;
    let hls: Hls | undefined;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = previewUrl;
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(previewUrl);
      hls.attachMedia(video);
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [previewUrl]);

  // Keyboard Listener

  const contentRef = useRef<HTMLDivElement | null>(null);
  useKeyboardListener([], undefined, contentRef);

  return (
    <div className="flex size-full flex-col gap-2 overflow-hidden px-1 pt-2 md:p-2">
      <Toaster closeButton={true} />

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{t("createExport")}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBuilder((prev) => !prev)}
            className="w-full sm:w-auto"
          >
            {showBuilder ? t("hideBuilder") : t("showBuilder")}
          </Button>
        </CardHeader>
        {showBuilder && (
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid grid-cols-1 gap-3">
              <div className="grid gap-1">
                <label className="text-sm font-semibold">{t("camera")}</label>
              <Select
                value={camera}
                onValueChange={(value) => setCamera(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("camera")} />
                </SelectTrigger>
                <SelectContent>
                  {config &&
                    Object.keys(config.cameras).map((cam) => (
                      <SelectItem key={cam} value={cam}>
                        {cam}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <DateTimePicker
              id="range-start"
              label={t("rangeStart")}
              value={rangeStart}
              max={rangeEnd}
              onChange={setRangeStart}
            />
            <DateTimePicker
              id="range-end"
              label={t("rangeEnd")}
              value={rangeEnd}
              min={rangeStart}
              onChange={setRangeEnd}
            />
            <div className="grid gap-2">
              <label className="text-sm font-semibold">
                {t("detectedEventId")}
              </label>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder={t("detectedEventId")}
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                />
                <Button variant="outline" onClick={() => loadEventRange(eventId)}>
                  {t("loadEvent")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("detectedEventHelp")}
              </p>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold">{t("quickSelections")}</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Button
                  variant="outline"
                  onClick={() => applyQuickRange("last24")}
                >
                  {t("last24Hours")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyQuickRange("today")}
                >
                  {t("todayRange")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyQuickRange("sunrise")}
                >
                  {t("sunriseSunset")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyQuickRange("sunset")}
                >
                  {t("evening")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => applyQuickRange("swap")}
                >
                  {t("swapRange")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("quickSelectionHelp")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="grid gap-1">
              <label className="text-sm font-semibold">{t("playbackSpeed")}</label>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {["1", "5", "10", "25", "50", "100", "custom"].map(
                  (speed) => (
                    <Button
                      key={speed}
                      variant={playback === speed ? "select" : "outline"}
                      onClick={() => setPlayback(speed)}
                    >
                      {speed === "custom" ? t("customSpeed") : `${speed}x`}
                    </Button>
                  ),
                )}
              </div>
              {playback === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    className="w-32"
                    type="number"
                    min={1}
                    max={999}
                    value={customPlayback}
                    onChange={(e) => setCustomPlayback(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">x</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t("timelapseHelp")}
              </p>
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-semibold">{t("contentType")}</label>
              <Select
                value={playbackSource}
                onValueChange={(value) => setPlaybackSource(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recordings">{t("allVideo")}</SelectItem>
                  <SelectItem value="preview">{t("allMotion")}</SelectItem>
                  <SelectItem value="events">{t("detectedEventsOnly")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("contentHelp")}
              </p>
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-semibold">{t("exportName")}</label>
              <Input
                placeholder={t("exportNamePlaceholder")}
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handlePreview} className="min-w-32">
                {t("previewSelection")}
              </Button>
              <Button onClick={handleStartExport} className="min-w-32">
                {t("startExport")}
              </Button>
              {fallbackCommand && (
                <Button
                  variant="outline"
                  onClick={() => copyFallback(fallbackCommand)}
                >
                  {t("copyFallback")}
                </Button>
              )}
            </div>
            {fallbackCommand && (
              <div className="rounded-md bg-muted p-3 text-xs">
                <p className="mb-1 font-semibold">{t("localCommandTitle")}</p>
                <p className="break-all font-mono">{fallbackCommand}</p>
              </div>
            )}
            {previewUrl && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">{t("previewTitle")}</p>
                <video
                  ref={previewRef}
                  className="w-full max-w-xl rounded-md border"
                  controls
                  playsInline
                  onError={() => toast.error(t("previewFailed"))}
                />
              </div>
            )}
          </div>
          </CardContent>
        )}
      </Card>

      <AlertDialog
        open={deleteClip != undefined}
        onOpenChange={() => setDeleteClip(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteExport")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteExport.desc", { exportName: deleteClip?.exportName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("button.cancel", { ns: "common" })}
            </AlertDialogCancel>
            <Button
              className="text-white"
              aria-label="Delete Export"
              variant="destructive"
              onClick={() => onHandleDelete()}
            >
              {t("button.delete", { ns: "common" })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={selected != undefined}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(undefined);
          }
        }}
      >
        <DialogContent
          className={cn(
            "max-h-[95dvh] sm:max-w-xl md:max-w-4xl lg:max-w-4xl xl:max-w-7xl",
            isMobile && "landscape:max-w-[60%]",
          )}
        >
          <DialogTitle className="smart-capitalize">
            {selected?.name?.replaceAll("_", " ")}
          </DialogTitle>
          <video
            className={cn(
              "size-full rounded-lg md:rounded-2xl",
              selectedAspect < 1.5 && "aspect-video h-full",
            )}
            playsInline
            preload="auto"
            autoPlay
            controls
            muted
            onLoadedData={(e) =>
              setSelectedAspect(
                e.currentTarget.videoWidth / e.currentTarget.videoHeight,
              )
            }
          >
            <source
              src={`${baseUrl}${selected?.video_path?.replace("/media/frigate/", "")}`}
              type="video/mp4"
            />
          </video>
        </DialogContent>
      </Dialog>

      {exports && (
        <div className="flex w-full items-center justify-center p-2">
          <Input
            className="text-md w-full bg-muted md:w-1/3"
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      <div className="w-full overflow-hidden">
        {exports && filteredExports && filteredExports.length > 0 ? (
          <div
            ref={contentRef}
            className="scrollbar-container grid size-full gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {Object.values(exports).map((item) => (
              <ExportCard
                key={item.name}
                className={
                  search == "" || filteredExports.includes(item) ? "" : "hidden"
                }
                exportedRecording={item}
                onSelect={setSelected}
                onRename={onHandleRename}
                onDelete={({ file, exportName }) =>
                  setDeleteClip({ file, exportName })
                }
              />
            ))}
          </div>
        ) : (
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center">
            <LuFolderX className="size-16" />
            {t("noExports")}
          </div>
        )}
      </div>
    </div>
  );
}

export default Exports;
