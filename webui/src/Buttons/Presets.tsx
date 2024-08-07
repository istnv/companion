import React, { useCallback, useContext, useEffect, useState } from 'react'
import { CAlert, CButton, CRow } from '@coreui/react'
import {
	ConnectionsContext,
	LoadingRetryOrError,
	socketEmitPromise,
	applyPatchOrReplaceSubObject,
	SocketContext,
} from '../util.js'
import { useDrag } from 'react-dnd'
import { ButtonPreviewBase, RedImage } from '../Components/ButtonPreview.js'
import { nanoid } from 'nanoid'
import type { ClientConnectionConfig } from '@companion-app/shared/Model/Common.js'
import type { UIPresetDefinition, UIPresetDefinitionText } from '@companion-app/shared/Model/Presets.js'
import type { Operation as JsonPatchOperation } from 'fast-json-patch'
import { RootAppStoreContext } from '../Stores/RootAppStore.js'
import { observer } from 'mobx-react-lite'
import type { ModuleDisplayInfo } from '@companion-app/shared/Model/ModuleInfo.js'

interface InstancePresetsProps {
	resetToken: string
}

export const InstancePresets = observer(function InstancePresets({ resetToken }: InstancePresetsProps) {
	const { socket, modules } = useContext(RootAppStoreContext)
	const connectionsContext = useContext(ConnectionsContext)

	const [connectionAndCategory, setConnectionAndCategory] = useState<
		[connectionId: string | null, category: string | null]
	>([null, null])
	const [presetsMap, setPresetsMap] = useState<Record<string, Record<string, UIPresetDefinition> | undefined> | null>(
		null
	)
	const [presetsError, setPresetsError] = useState<string | null>(null)
	const [reloadToken, setReloadToken] = useState(nanoid())

	const doRetryPresetsLoad = useCallback(() => setReloadToken(nanoid()), [])

	// Reset selection on resetToken change
	useEffect(() => {
		setConnectionAndCategory([null, null])
	}, [resetToken])

	useEffect(() => {
		setPresetsMap(null)
		setPresetsError(null)

		socketEmitPromise(socket, 'presets:subscribe', [])
			.then((data) => {
				console.log('presets:subscribe', data)
				setPresetsMap(data)
			})
			.catch((e) => {
				console.error('Failed to load presets', e)
				setPresetsError('Failed to load presets')
			})

		const updatePresets = (id: string, patch: JsonPatchOperation[] | Record<string, UIPresetDefinition> | null) => {
			setPresetsMap((oldPresets) =>
				oldPresets
					? applyPatchOrReplaceSubObject<Record<string, UIPresetDefinition> | undefined>(oldPresets, id, patch, {})
					: null
			)
		}

		socket.on('presets:update', updatePresets)

		return () => {
			socket.off('presets:update', updatePresets)

			socketEmitPromise(socket, 'presets:unsubscribe', []).catch(() => {
				console.error('Failed to unsubscribe to presets')
			})
		}
	}, [socket, reloadToken])

	if (!presetsMap) {
		// Show loading or an error
		return (
			<CRow>
				<LoadingRetryOrError error={presetsError} dataReady={!!presetsMap} doRetry={doRetryPresetsLoad} />
			</CRow>
		)
	}

	if (connectionAndCategory[0]) {
		const connectionInfo = connectionsContext[connectionAndCategory[0]]
		const moduleInfo = connectionInfo ? modules.modules.get(connectionInfo.instance_type) : undefined

		const presets = presetsMap[connectionAndCategory[0]] ?? {}

		if (connectionAndCategory[1]) {
			return (
				<PresetsButtonList
					presets={presets}
					selectedConnectionId={connectionAndCategory[0]}
					selectedCategory={connectionAndCategory[1]}
					setConnectionAndCategory={setConnectionAndCategory}
				/>
			)
		} else {
			return (
				<PresetsCategoryList
					presets={presets}
					connectionInfo={connectionInfo}
					moduleInfo={moduleInfo}
					selectedConnectionId={connectionAndCategory[0]}
					setConnectionAndCategory={setConnectionAndCategory}
				/>
			)
		}
	} else {
		return <PresetsConnectionList presets={presetsMap} setConnectionAndCategory={setConnectionAndCategory} />
	}
})

interface PresetsConnectionListProps {
	presets: Record<string, Record<string, UIPresetDefinition> | undefined>
	setConnectionAndCategory: (info: [connectionId: string | null, category: string | null]) => void
}

const PresetsConnectionList = observer(function PresetsConnectionList({
	presets,
	setConnectionAndCategory,
}: PresetsConnectionListProps) {
	const { modules } = useContext(RootAppStoreContext)
	const connectionsContext = useContext(ConnectionsContext)

	const options = Object.entries(presets).map(([id, vals]) => {
		if (!vals || Object.values(vals).length === 0) return ''

		const connectionInfo = connectionsContext[id]
		const moduleInfo = connectionInfo ? modules.modules.get(connectionInfo.instance_type) : undefined

		return (
			<CButton key={id} color="danger" onClick={() => setConnectionAndCategory([id, null])}>
				{moduleInfo?.name ?? '?'} ({connectionInfo?.label ?? id})
			</CButton>
		)
	})

	return (
		<div>
			<h5>Presets</h5>
			<p>
				Here are some ready made buttons with text, actions and feedback which you can drop onto a button to help you
				get started quickly.
				<br />
				Not every module provides presets, and you can do a lot more by editing the actions and feedbacks on a button
				manually.
			</p>
			{options.length === 0 ? (
				<CAlert color="info">You have no connections that support presets at the moment.</CAlert>
			) : (
				<div className="preset-category-grid">{options}</div>
			)}
		</div>
	)
})

interface PresetsCategoryListProps {
	presets: Record<string, UIPresetDefinition>
	connectionInfo: ClientConnectionConfig
	moduleInfo: ModuleDisplayInfo | undefined
	selectedConnectionId: string
	setConnectionAndCategory: (info: [connectionId: string | null, category: string | null]) => void
}

function PresetsCategoryList({
	presets,
	connectionInfo,
	moduleInfo,
	selectedConnectionId,
	setConnectionAndCategory,
}: Readonly<PresetsCategoryListProps>) {
	const categories = new Set<string>()
	for (const preset of Object.values(presets)) {
		categories.add(preset.category)
	}

	const doBack = useCallback(() => setConnectionAndCategory([null, null]), [setConnectionAndCategory])

	const buttons = Array.from(categories)
		.sort((a, b) => a.localeCompare(b))
		.map((category) => {
			return (
				<CButton
					key={category}
					color="danger"
					onClick={() => setConnectionAndCategory([selectedConnectionId, category])}
				>
					{category}
				</CButton>
			)
		})

	return (
		<div>
			<h5>
				<CButton color="primary" size="sm" onClick={doBack}>
					Back
				</CButton>
				{moduleInfo?.name ?? '?'} ({connectionInfo?.label ?? selectedConnectionId})
			</h5>

			{buttons.length === 0 ? (
				<CAlert color="primary">Connection has no presets.</CAlert>
			) : (
				<div className="preset-category-grid">{buttons}</div>
			)}
		</div>
	)
}

interface PresetsButtonListProps {
	presets: Record<string, UIPresetDefinition>
	selectedConnectionId: string
	selectedCategory: string
	setConnectionAndCategory: (info: [connectionId: string | null, category: string | null]) => void
}

function PresetsButtonList({
	presets,
	selectedConnectionId,
	selectedCategory,
	setConnectionAndCategory,
}: Readonly<PresetsButtonListProps>) {
	const doBack = useCallback(
		() => setConnectionAndCategory([selectedConnectionId, null]),
		[setConnectionAndCategory, selectedConnectionId]
	)

	const filteredPresets = Object.values(presets)
		.filter((p) => p.category === selectedCategory)
		.sort((a, b) => a.order - b.order)

	return (
		<div>
			<h5>
				<CButton color="primary" size="sm" onClick={doBack}>
					Back
				</CButton>
				{selectedCategory}
			</h5>
			<p>Drag and drop the preset buttons below into your buttons-configuration.</p>

			{filteredPresets.map((preset) => {
				if (preset.type === 'button') {
					return (
						<PresetIconPreview
							key={preset.id}
							connectionId={selectedConnectionId}
							presetId={preset.id}
							title={preset.label}
						/>
					)
				} else if (preset.type === 'text') {
					return <PresetText key={preset.id} preset={preset} />
				}
				return null
			})}

			<br style={{ clear: 'both' }} />
		</div>
	)
}

interface PresetTextProps {
	preset: UIPresetDefinitionText
}

function PresetText({ preset }: Readonly<PresetTextProps>) {
	return (
		<div>
			<h5>{preset.label}</h5>
			<p>{preset.text}</p>
		</div>
	)
}

interface PresetIconPreviewProps {
	connectionId: string
	presetId: string
	title: string
}

function PresetIconPreview({ connectionId, presetId, title }: Readonly<PresetIconPreviewProps>) {
	const socket = useContext(SocketContext)
	const [previewImage, setPreviewImage] = useState<string | null>(null)
	const [previewError, setPreviewError] = useState(false)
	const [retryToken, setRetryToken] = useState(nanoid())

	const [, drag] = useDrag<PresetDragItem>({
		type: 'preset',
		item: {
			connectionId: connectionId,
			presetId: presetId,
		},
	})

	useEffect(() => {
		setPreviewError(false)

		socketEmitPromise(socket, 'presets:preview_render', [connectionId, presetId])
			.then((img) => {
				setPreviewImage(img)
			})
			.catch(() => {
				console.error('Failed to preview control')
				setPreviewError(true)
			})
	}, [presetId, socket, connectionId, retryToken])

	const onClick = useCallback((isDown: boolean) => isDown && setRetryToken(nanoid()), [])

	return (
		<ButtonPreviewBase
			fixedSize
			dragRef={drag}
			title={title}
			preview={previewError ? RedImage : previewImage}
			onClick={previewError ? onClick : undefined}
		/>
	)
}

export interface PresetDragItem {
	connectionId: string
	presetId: string
}
