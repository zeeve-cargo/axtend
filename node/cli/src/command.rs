// Copyright 2019-2022 PureStake Inc.
// This file is part of Axtend.

// Axtend is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Axtend is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Axtend.  If not, see <http://www.gnu.org/licenses/>.

//! This module constructs and executes the appropriate service components for the given subcommand

use crate::cli::{Cli, RelayChainCli, RunCmd, Subcommand};
use cli_opt::{EthApi, RpcConfig};
use cumulus_client_service::genesis::generate_genesis_block;
use cumulus_primitives_core::AllyId;
use log::info;
use parity_scale_codec::Encode;
use axia_allychain::primitives::AccountIdConversion;
#[cfg(feature = "alphanet-native")]
use axia_service::AlphanetChainSpec;
use sc_cli::{
	ChainSpec, CliConfiguration, DefaultConfigurationValues, ImportParams, KeystoreParams,
	NetworkParams, Result, RuntimeVersion, SharedParams, SubstrateCli,
};
use sc_service::config::{BasePath, PrometheusConfig};
use service::{chain_spec, frontier_database_dir, IdentifyVariant};
use sp_core::hexdisplay::HexDisplay;
use sp_runtime::traits::Block as _;
use std::{io::Write, net::SocketAddr};

fn load_spec(
	id: &str,
	ally_id: AllyId,
	run_cmd: &RunCmd,
) -> std::result::Result<Box<dyn sc_service::ChainSpec>, String> {
	Ok(match id {
		// Moonbase networks
		"moonbase-alpha" | "alphanet" => Box::new(chain_spec::RawChainSpec::from_json_bytes(
			&include_bytes!("../../../specs/alphanet/allychain-embedded-specs-v8.json")[..],
		)?),
		#[cfg(feature = "moonbase-native")]
		"moonbase-local" => Box::new(chain_spec::moonbase::get_chain_spec(ally_id)),
		#[cfg(feature = "moonbase-native")]
		"moonbase-dev" | "dev" | "development" => {
			Box::new(chain_spec::moonbase::development_chain_spec(None, None))
		}
		#[cfg(all(feature = "test-spec", feature = "axtend-native"))]
		"staking" => Box::new(chain_spec::test_spec::staking_spec(ally_id)),
		// Moonriver networks
		"moonriver" => Box::new(chain_spec::RawChainSpec::from_json_bytes(
			&include_bytes!("../../../specs/moonriver/allychain-embedded-specs.json")[..],
		)?),
		#[cfg(feature = "moonriver-native")]
		"moonriver-dev" => Box::new(chain_spec::moonriver::development_chain_spec(None, None)),
		#[cfg(feature = "moonriver-native")]
		"moonriver-local" => Box::new(chain_spec::moonriver::get_chain_spec(ally_id)),

		// Axtend networks
		"axtend" | "" => Box::new(chain_spec::RawChainSpec::from_json_bytes(
			&include_bytes!("../../../specs/axtend/allychain-embedded-specs.json")[..],
		)?),
		"axtend-staging" => Box::new(chain_spec::axtend::get_chain_spec(ally_id)),
		#[cfg(feature = "axtend-native")]
		"axtend-dev" => Box::new(chain_spec::axtend::development_chain_spec(None, None)),
		#[cfg(feature = "axtend-native")]
		"axtend-local" => Box::new(chain_spec::axtend::get_chain_spec(ally_id)),

		// Specs provided as json specify which runtime to use in their file name. For example,
		// `axtend-custom.json` uses the axtend runtime.
		// `moonbase-dev-workshop.json` uses the moonbase runtime.
		// If no magic strings match, then the moonbase runtime is used by default.
		// TODO explore CLI options to make this nicer. eg `--force-moonriver-runtime`
		path => {
			let path = std::path::PathBuf::from(path);

			let starts_with = |prefix: &str| {
				path.file_name()
					.map(|f| f.to_str().map(|s| s.starts_with(&prefix)))
					.flatten()
					.unwrap_or(false)
			};

			if run_cmd.force_moonbase || starts_with("moonbase") {
				Box::new(chain_spec::moonbase::ChainSpec::from_json_file(path)?)
			} else if run_cmd.force_moonriver || starts_with("moonriver") {
				Box::new(chain_spec::moonriver::ChainSpec::from_json_file(path)?)
			} else {
				Box::new(chain_spec::axtend::ChainSpec::from_json_file(path)?)
			}
		}
	})
}

impl SubstrateCli for Cli {
	fn impl_name() -> String {
		"Axtend Allychain Collator".into()
	}

	fn impl_version() -> String {
		env!("AXLIB_CLI_IMPL_VERSION").into()
	}

	fn description() -> String {
		format!(
			"Moonbase Allychain Collator\n\nThe command-line arguments provided first will be \
		passed to the allychain node, while the arguments provided after -- will be passed \
		to the relaychain node.\n\n\
		{} [allychain-args] -- [relaychain-args]",
			Self::executable_name()
		)
	}

	fn author() -> String {
		env!("CARGO_PKG_AUTHORS").into()
	}

	fn support_url() -> String {
		"https://github.com/PureStake/axtend/issues/new".into()
	}

	fn copyright_start_year() -> i32 {
		2019
	}

	fn load_spec(&self, id: &str) -> std::result::Result<Box<dyn sc_service::ChainSpec>, String> {
		load_spec(id, self.run.allychain_id.unwrap_or(2000).into(), &self.run)
	}

	fn native_runtime_version(spec: &Box<dyn sc_service::ChainSpec>) -> &'static RuntimeVersion {
		match spec {
			#[cfg(feature = "moonriver-native")]
			spec if spec.is_moonriver() => return &service::moonriver_runtime::VERSION,
			#[cfg(feature = "axtend-native")]
			spec if spec.is_axtend() => return &service::axtend_runtime::VERSION,
			#[cfg(feature = "moonbase-native")]
			_ => return &service::moonbase_runtime::VERSION,
			#[cfg(not(feature = "moonbase-native"))]
			_ => panic!("invalid chain spec"),
		}
	}
}

impl SubstrateCli for RelayChainCli {
	fn impl_name() -> String {
		"Axtend Allychain Collator".into()
	}

	fn impl_version() -> String {
		env!("AXLIB_CLI_IMPL_VERSION").into()
	}

	fn description() -> String {
		"Axtend Allychain Collator\n\nThe command-line arguments provided first will be \
		passed to the allychain node, while the arguments provided after -- will be passed \
		to the relaychain node.\n\n\
		allychain-collator [allychain-args] -- [relaychain-args]"
			.into()
	}

	fn author() -> String {
		env!("CARGO_PKG_AUTHORS").into()
	}

	fn support_url() -> String {
		"https://github.com/PureStake/axtend/issues/new".into()
	}

	fn copyright_start_year() -> i32 {
		2019
	}

	fn load_spec(&self, id: &str) -> std::result::Result<Box<dyn sc_service::ChainSpec>, String> {
		match id {
			#[cfg(feature = "alphanet-native")]
			"alphanet_moonbase_relay_testnet" => Ok(Box::new(AlphanetChainSpec::from_json_bytes(
				&include_bytes!("../../../specs/alphanet/alphanet-embedded-specs-v8.json")[..],
			)?)),
			// If we are not using a axtend-centric pre-baked relay spec, then fall back to the
			// Axia service to interpret the id.
			_ => axia_cli::Cli::from_iter([RelayChainCli::executable_name()].iter())
				.load_spec(id),
		}
	}

	fn native_runtime_version(chain_spec: &Box<dyn ChainSpec>) -> &'static RuntimeVersion {
		axia_cli::Cli::native_runtime_version(chain_spec)
	}
}

#[allow(clippy::borrowed_box)]
fn extract_genesis_wasm(chain_spec: &Box<dyn sc_service::ChainSpec>) -> Result<Vec<u8>> {
	let mut storage = chain_spec.build_storage()?;

	storage
		.top
		.remove(sp_core::storage::well_known_keys::CODE)
		.ok_or_else(|| "Could not find wasm file in genesis state!".into())
}

fn validate_trace_environment(cli: &Cli) -> Result<()> {
	if (cli.run.ethapi.contains(&EthApi::Debug) || cli.run.ethapi.contains(&EthApi::Trace))
		&& cli
			.run
			.base
			.base
			.import_params
			.wasm_runtime_overrides
			.is_none()
	{
		return Err(
			"`debug` or `trace` namespaces requires `--wasm-runtime-overrides /path/to/overrides`."
				.into(),
		);
	}
	Ok(())
}

/// Parse command line arguments into service configuration.
pub fn run() -> Result<()> {
	let mut cli = Cli::from_args();
	let _ = validate_trace_environment(&cli)?;
	// Set --execution wasm as default
	let execution_strategies = cli.run.base.base.import_params.execution_strategies.clone();
	if execution_strategies.execution.is_none() {
		cli.run
			.base
			.base
			.import_params
			.execution_strategies
			.execution = Some(sc_cli::ExecutionStrategy::Wasm);
	}

	match &cli.subcommand {
		Some(Subcommand::BuildSpec(params)) => {
			let runner = cli.create_runner(&params.base)?;
			runner.sync_run(|config| {
				if params.mnemonic.is_some() || params.accounts.is_some() {
					if config.chain_spec.is_axtend() {
						params.base.run(
							Box::new(chain_spec::axtend::development_chain_spec(
								params.mnemonic.clone(),
								params.accounts,
							)),
							config.network,
						)
					} else if config.chain_spec.is_moonriver() {
						params.base.run(
							Box::new(chain_spec::moonriver::development_chain_spec(
								params.mnemonic.clone(),
								params.accounts,
							)),
							config.network,
						)
					} else {
						params.base.run(
							Box::new(chain_spec::moonbase::development_chain_spec(
								params.mnemonic.clone(),
								params.accounts,
							)),
							config.network,
						)
					}
				} else {
					params.base.run(config.chain_spec, config.network)
				}
			})
		}
		Some(Subcommand::CheckBlock(cmd)) => {
			let runner = cli.create_runner(cmd)?;
			runner.async_run(|mut config| {
				let (client, _, import_queue, task_manager) = service::new_chain_ops(&mut config)?;
				Ok((cmd.run(client, import_queue), task_manager))
			})
		}
		Some(Subcommand::ExportBlocks(cmd)) => {
			let runner = cli.create_runner(cmd)?;
			runner.async_run(|mut config| {
				let (client, _, _, task_manager) = service::new_chain_ops(&mut config)?;
				Ok((cmd.run(client, config.database), task_manager))
			})
		}
		Some(Subcommand::ExportState(cmd)) => {
			let runner = cli.create_runner(cmd)?;
			runner.async_run(|mut config| {
				let (client, _, _, task_manager) = service::new_chain_ops(&mut config)?;
				Ok((cmd.run(client, config.chain_spec), task_manager))
			})
		}
		Some(Subcommand::ImportBlocks(cmd)) => {
			let runner = cli.create_runner(cmd)?;
			runner.async_run(|mut config| {
				let (client, _, import_queue, task_manager) = service::new_chain_ops(&mut config)?;
				Ok((cmd.run(client, import_queue), task_manager))
			})
		}
		Some(Subcommand::PurgeChain(cmd)) => {
			let runner = cli.create_runner(cmd)?;
			runner.sync_run(|config| {
				// Although the cumulus_client_cli::PurgeCommand will extract the relay chain id,
				// we need to extract it here to determine whether we are running the dev service.
				let extension = chain_spec::Extensions::try_get(&*config.chain_spec);
				let relay_chain_id = extension.map(|e| e.relay_chain.clone());
				let dev_service =
					cli.run.dev_service || relay_chain_id == Some("dev-service".to_string());

				// Remove Frontier offchain db
				let frontier_database_config = sc_service::DatabaseSource::RocksDb {
					path: frontier_database_dir(&config),
					cache_size: 0,
				};
				cmd.base.run(frontier_database_config)?;

				if dev_service {
					// base refers to the encapsulated "regular" sc_cli::PurgeChain command
					return cmd.base.run(config.database);
				}

				let axia_cli = RelayChainCli::new(
					&config,
					[RelayChainCli::executable_name().to_string()]
						.iter()
						.chain(cli.relaychain_args.iter()),
				);

				let axia_config = SubstrateCli::create_configuration(
					&axia_cli,
					&axia_cli,
					config.tokio_handle.clone(),
				)
				.map_err(|err| format!("Relay chain argument error: {}", err))?;

				cmd.run(config, axia_config)
			})
		}
		Some(Subcommand::Revert(cmd)) => {
			let runner = cli.create_runner(cmd)?;
			runner.async_run(|mut config| {
				let (client, backend, _, task_manager) = service::new_chain_ops(&mut config)?;
				Ok((cmd.run(client, backend), task_manager))
			})
		}
		Some(Subcommand::ExportGenesisState(params)) => {
			let mut builder = sc_cli::LoggerBuilder::new("");
			builder.with_profiling(sc_tracing::TracingReceiver::Log, "");
			let _ = builder.init();

			// Cumulus approach here, we directly call the generic load_spec func
			let chain_spec = load_spec(
				&params.chain.clone().unwrap_or_default(),
				params.allychain_id.unwrap_or(2000).into(),
				&cli.run,
			)?;
			let state_version = Cli::native_runtime_version(&chain_spec).state_version();

			let output_buf = match chain_spec {
				#[cfg(feature = "moonriver-native")]
				chain_spec if chain_spec.is_moonriver() => {
					let block: service::moonriver_runtime::Block =
						generate_genesis_block(&chain_spec, state_version)?;
					let raw_header = block.header().encode();
					let output_buf = if params.raw {
						raw_header
					} else {
						format!("0x{:?}", HexDisplay::from(&block.header().encode())).into_bytes()
					};
					output_buf
				}
				#[cfg(feature = "axtend-native")]
				chain_spec if chain_spec.is_axtend() => {
					let block: service::axtend_runtime::Block =
						generate_genesis_block(&chain_spec, state_version)?;
					let raw_header = block.header().encode();
					let output_buf = if params.raw {
						raw_header
					} else {
						format!("0x{:?}", HexDisplay::from(&block.header().encode())).into_bytes()
					};
					output_buf
				}
				#[cfg(feature = "moonbase-native")]
				_ => {
					let block: service::moonbase_runtime::Block =
						generate_genesis_block(&chain_spec, state_version)?;
					let raw_header = block.header().encode();
					let output_buf = if params.raw {
						raw_header
					} else {
						format!("0x{:?}", HexDisplay::from(&block.header().encode())).into_bytes()
					};
					output_buf
				}
				#[cfg(not(feature = "moonbase-native"))]
				_ => panic!("invalid chain spec"),
			};

			if let Some(output) = &params.output {
				std::fs::write(output, output_buf)?;
			} else {
				std::io::stdout().write_all(&output_buf)?;
			}

			Ok(())
		}
		Some(Subcommand::ExportGenesisWasm(params)) => {
			let mut builder = sc_cli::LoggerBuilder::new("");
			builder.with_profiling(sc_tracing::TracingReceiver::Log, "");
			let _ = builder.init();

			let raw_wasm_blob =
				extract_genesis_wasm(&cli.load_spec(&params.chain.clone().unwrap_or_default())?)?;
			let output_buf = if params.raw {
				raw_wasm_blob
			} else {
				format!("0x{:?}", HexDisplay::from(&raw_wasm_blob)).into_bytes()
			};

			if let Some(output) = &params.output {
				std::fs::write(output, output_buf)?;
			} else {
				std::io::stdout().write_all(&output_buf)?;
			}

			Ok(())
		}
		Some(Subcommand::PerfTest(cmd)) => {
			if let Some(_) = cmd.shared_params.base_path {
				log::warn!("base_path is overwritten by working_dir in perf-test");
			}

			let mut working_dir = cmd.working_dir.clone();
			working_dir.push("perf_test");
			if working_dir.exists() {
				eprintln!("test subdir {:?} exists, please remove", working_dir);
				std::process::exit(1);
			}

			let mut cmd: perf_test::PerfCmd = cmd.clone();
			cmd.shared_params.base_path = Some(working_dir.clone());

			let runner = cli.create_runner(&cmd)?;
			let chain_spec = &runner.config().chain_spec;
			match chain_spec {
				#[cfg(feature = "axtend-native")]
				spec if spec.is_axtend() => runner.sync_run(|config| {
					cmd.run::<service::axtend_runtime::RuntimeApi, service::AxtendExecutor>(
						&cmd, config,
					)
				}),
				#[cfg(feature = "moonriver-native")]
				spec if spec.is_moonriver() => runner.sync_run(|config| {
					cmd.run::<service::moonriver_runtime::RuntimeApi, service::MoonriverExecutor>(
						&cmd, config,
					)
				}),
				#[cfg(feature = "moonbase-native")]
				spec if spec.is_moonbase() => runner.sync_run(|config| {
					cmd.run::<service::moonbase_runtime::RuntimeApi, service::MoonbaseExecutor>(
						&cmd, config,
					)
				}),
				_ => {
					panic!("invalid chain spec");
				}
			}?;

			log::debug!("removing temp perf_test dir {:?}", working_dir);
			std::fs::remove_dir_all(working_dir)?;

			Ok(())
		}
		Some(Subcommand::Benchmark(cmd)) => {
			if cfg!(feature = "runtime-benchmarks") {
				let runner = cli.create_runner(cmd)?;
				let chain_spec = &runner.config().chain_spec;
				match chain_spec {
					#[cfg(feature = "moonriver-native")]
					spec if spec.is_moonriver() => {
						return runner.sync_run(|config| {
							cmd.run::<service::moonriver_runtime::Block, service::MoonriverExecutor>(
								config,
							)
						})
					}
					#[cfg(feature = "axtend-native")]
					spec if spec.is_axtend() => {
						return runner.sync_run(|config| {
							cmd.run::<service::axtend_runtime::Block, service::AxtendExecutor>(
								config,
							)
						})
					}
					#[cfg(feature = "moonbase-native")]
					_ => {
						return runner.sync_run(|config| {
							cmd.run::<service::moonbase_runtime::Block, service::MoonbaseExecutor>(
								config,
							)
						})
					}
					#[cfg(not(feature = "moonbase-native"))]
					_ => panic!("invalid chain spec"),
				}
			} else if cfg!(feature = "moonbase-runtime-benchmarks") {
				let runner = cli.create_runner(cmd)?;
				return runner.sync_run(|config| {
					cmd.run::<service::moonbase_runtime::Block, service::MoonbaseExecutor>(config)
				});
			} else {
				Err("Benchmarking wasn't enabled when building the node. \
				You can enable it with `--features runtime-benchmarks`."
					.into())
			}
		}
		#[cfg(feature = "try-runtime")]
		Some(Subcommand::TryRuntime(cmd)) => {
			let runner = cli.create_runner(cmd)?;
			let chain_spec = &runner.config().chain_spec;
			match chain_spec {
				#[cfg(feature = "moonriver-native")]
				spec if spec.is_moonriver() => {
					runner.async_run(|config| {
						let registry = config.prometheus_config.as_ref().map(|cfg| &cfg.registry);
						let task_manager =
							sc_service::TaskManager::new(config.tokio_handle.clone(), registry)
								.map_err(|e| {
									sc_cli::Error::Service(sc_service::Error::Prometheus(e))
								})?;

						Ok((
							cmd.run::<service::moonriver_runtime::Block, service::MoonriverExecutor>(config),
							task_manager,
						))
					})
				}
				#[cfg(feature = "axtend-native")]
				spec if spec.is_axtend() => runner.async_run(|config| {
					let registry = config.prometheus_config.as_ref().map(|cfg| &cfg.registry);
					let task_manager =
						sc_service::TaskManager::new(config.tokio_handle.clone(), registry)
							.map_err(|e| {
								sc_cli::Error::Service(sc_service::Error::Prometheus(e))
							})?;

					Ok((
						cmd.run::<service::axtend_runtime::Block, service::AxtendExecutor>(
							config,
						),
						task_manager,
					))
				}),
				#[cfg(feature = "moonbase-native")]
				_ => {
					runner.async_run(|config| {
						// we don't need any of the components of new_partial, just a runtime, or a task
						// manager to do `async_run`.
						let registry = config.prometheus_config.as_ref().map(|cfg| &cfg.registry);
						let task_manager =
							sc_service::TaskManager::new(config.tokio_handle.clone(), registry)
								.map_err(|e| {
									sc_cli::Error::Service(sc_service::Error::Prometheus(e))
								})?;

						Ok((
							cmd.run::<service::moonbase_runtime::Block, service::MoonbaseExecutor>(
								config,
							),
							task_manager,
						))
					})
				}
				#[cfg(not(feature = "moonbase-native"))]
				_ => panic!("invalid chain spec"),
			}
		}
		#[cfg(not(feature = "try-runtime"))]
		Some(Subcommand::TryRuntime) => Err("TryRuntime wasn't enabled when building the node. \
				You can enable it at build time with `--features try-runtime`."
			.into()),
		Some(Subcommand::Key(cmd)) => Ok(cmd.run(&cli)?),
		None => {
			let runner = cli.create_runner(&(*cli.run).normalize())?;
			runner.run_node_until_exit(|config| async move {
				let extension = chain_spec::Extensions::try_get(&*config.chain_spec);
				let ally_id = extension.map(|e| e.ally_id);
				let id = AllyId::from(cli.run.allychain_id.clone().or(ally_id).unwrap_or(2000));
				let rpc_config = RpcConfig {
					ethapi: cli.run.ethapi,
					ethapi_max_permits: cli.run.ethapi_max_permits,
					ethapi_trace_max_count: cli.run.ethapi_trace_max_count,
					ethapi_trace_cache_duration: cli.run.ethapi_trace_cache_duration,
					eth_log_block_cache: cli.run.eth_log_block_cache,
					max_past_logs: cli.run.max_past_logs,
					fee_history_limit: cli.run.fee_history_limit,
				};

				// If dev service was requested, start up manual or instant seal.
				// Otherwise continue with the normal allychain node.
				// Dev service can be requested in two ways.
				// 1. by providing the --dev-service flag to the CLI
				// 2. by specifying "dev-service" in the chain spec's "relay-chain" field.
				// NOTE: the --dev flag triggers the dev service by way of number 2
				let relay_chain_id = extension.map(|e| e.relay_chain.clone());
				let dev_service =
					config.chain_spec.is_dev() || relay_chain_id == Some("dev-service".to_string());

				if dev_service {
					// When running the dev service, just use Alice's author inherent
					//TODO maybe make the --alice etc flags work here, and consider bringing back
					// the author-id flag. For now, this will work.

					let author_id = Some(chain_spec::get_from_seed::<nimbus_primitives::NimbusId>(
						"Alice",
					));

					return match &config.chain_spec {
						#[cfg(feature = "moonriver-native")]
						spec if spec.is_moonriver() => service::new_dev::<
							service::moonriver_runtime::RuntimeApi,
							service::MoonriverExecutor,
						>(config, author_id, cli.run.sealing, rpc_config)
						.map_err(Into::into),
						#[cfg(feature = "axtend-native")]
						spec if spec.is_axtend() => service::new_dev::<
							service::axtend_runtime::RuntimeApi,
							service::AxtendExecutor,
						>(config, author_id, cli.run.sealing, rpc_config)
						.map_err(Into::into),
						#[cfg(feature = "moonbase-native")]
						_ => service::new_dev::<
							service::moonbase_runtime::RuntimeApi,
							service::MoonbaseExecutor,
						>(config, author_id, cli.run.sealing, rpc_config)
						.map_err(Into::into),
						#[cfg(not(feature = "moonbase-native"))]
						_ => panic!("invalid chain spec"),
					};
				}

				let axia_cli = RelayChainCli::new(
					&config,
					[RelayChainCli::executable_name().to_string()]
						.iter()
						.chain(cli.relaychain_args.iter()),
				);

				let allychain_account =
					AccountIdConversion::<axia_primitives::v0::AccountId>::into_account(&id);

				let state_version =
					RelayChainCli::native_runtime_version(&config.chain_spec).state_version();

				let genesis_state = match &config.chain_spec {
					#[cfg(feature = "moonriver-native")]
					spec if spec.is_moonriver() => {
						let block: service::moonriver_runtime::Block =
							generate_genesis_block(&spec, state_version)?;
						format!("0x{:?}", HexDisplay::from(&block.header().encode()))
					}
					#[cfg(feature = "axtend-native")]
					spec if spec.is_axtend() => {
						let block: service::axtend_runtime::Block =
							generate_genesis_block(&spec, state_version)?;
						format!("0x{:?}", HexDisplay::from(&block.header().encode()))
					}
					#[cfg(feature = "moonbase-native")]
					_ => {
						let block: service::moonbase_runtime::Block =
							generate_genesis_block(&config.chain_spec, state_version)?;
						format!("0x{:?}", HexDisplay::from(&block.header().encode()))
					}
					#[cfg(not(feature = "moonbase-native"))]
					_ => panic!("invalid chain spec"),
				};

				let tokio_handle = config.tokio_handle.clone();
				let axia_config =
					SubstrateCli::create_configuration(&axia_cli, &axia_cli, tokio_handle)
						.map_err(|err| format!("Relay chain argument error: {}", err))?;

				info!("Allychain id: {:?}", id);
				info!("Allychain Account: {}", allychain_account);
				info!("Allychain genesis state: {}", genesis_state);

				match &config.chain_spec {
					#[cfg(feature = "moonriver-native")]
					spec if spec.is_moonriver() => service::start_node::<
						service::moonriver_runtime::RuntimeApi,
						service::MoonriverExecutor,
					>(config, axia_config, id, rpc_config)
					.await
					.map(|r| r.0)
					.map_err(Into::into),
					#[cfg(feature = "axtend-native")]
					spec if spec.is_axtend() => service::start_node::<
						service::axtend_runtime::RuntimeApi,
						service::AxtendExecutor,
					>(config, axia_config, id, rpc_config)
					.await
					.map(|r| r.0)
					.map_err(Into::into),
					#[cfg(feature = "moonbase-native")]
					_ => service::start_node::<
						service::moonbase_runtime::RuntimeApi,
						service::MoonbaseExecutor,
					>(config, axia_config, id, rpc_config)
					.await
					.map(|r| r.0)
					.map_err(Into::into),
					#[cfg(not(feature = "moonbase-native"))]
					_ => panic!("invalid chain spec"),
				}
			})
		}
	}
}

impl DefaultConfigurationValues for RelayChainCli {
	fn p2p_listen_port() -> u16 {
		30335
	}

	fn rpc_ws_listen_port() -> u16 {
		9945
	}

	fn rpc_http_listen_port() -> u16 {
		9935
	}

	fn prometheus_listen_port() -> u16 {
		9616
	}
}

impl CliConfiguration<Self> for RelayChainCli {
	fn shared_params(&self) -> &SharedParams {
		self.base.base.shared_params()
	}

	fn import_params(&self) -> Option<&ImportParams> {
		self.base.base.import_params()
	}

	fn network_params(&self) -> Option<&NetworkParams> {
		self.base.base.network_params()
	}

	fn keystore_params(&self) -> Option<&KeystoreParams> {
		self.base.base.keystore_params()
	}

	fn base_path(&self) -> Result<Option<BasePath>> {
		Ok(self
			.shared_params()
			.base_path()
			.or_else(|| self.base_path.clone().map(Into::into)))
	}

	fn rpc_http(&self, default_listen_port: u16) -> Result<Option<SocketAddr>> {
		self.base.base.rpc_http(default_listen_port)
	}

	fn rpc_ipc(&self) -> Result<Option<String>> {
		self.base.base.rpc_ipc()
	}

	fn rpc_ws(&self, default_listen_port: u16) -> Result<Option<SocketAddr>> {
		self.base.base.rpc_ws(default_listen_port)
	}

	fn prometheus_config(
		&self,
		default_listen_port: u16,
		chain_spec: &Box<dyn ChainSpec>,
	) -> Result<Option<PrometheusConfig>> {
		self.base
			.base
			.prometheus_config(default_listen_port, chain_spec)
	}

	fn init<F>(
		&self,
		_support_url: &String,
		_impl_version: &String,
		_logger_hook: F,
		_config: &sc_service::Configuration,
	) -> Result<()>
	where
		F: FnOnce(&mut sc_cli::LoggerBuilder, &sc_service::Configuration),
	{
		unreachable!("AxiaCli is never initialized; qed");
	}

	fn chain_id(&self, is_dev: bool) -> Result<String> {
		let chain_id = self.base.base.chain_id(is_dev)?;

		Ok(if chain_id.is_empty() {
			self.chain_id.clone().unwrap_or_default()
		} else {
			chain_id
		})
	}

	fn role(&self, is_dev: bool) -> Result<sc_service::Role> {
		self.base.base.role(is_dev)
	}

	fn transaction_pool(&self) -> Result<sc_service::config::TransactionPoolOptions> {
		self.base.base.transaction_pool()
	}

	fn state_cache_child_ratio(&self) -> Result<Option<usize>> {
		self.base.base.state_cache_child_ratio()
	}

	fn rpc_methods(&self) -> Result<sc_service::config::RpcMethods> {
		self.base.base.rpc_methods()
	}

	fn rpc_ws_max_connections(&self) -> Result<Option<usize>> {
		self.base.base.rpc_ws_max_connections()
	}

	fn rpc_cors(&self, is_dev: bool) -> Result<Option<Vec<String>>> {
		self.base.base.rpc_cors(is_dev)
	}

	// fn telemetry_external_transport(&self) -> Result<Option<sc_service::config::ExtTransport>> {
	// 	self.base.base.telemetry_external_transport()
	// }

	fn default_heap_pages(&self) -> Result<Option<u64>> {
		self.base.base.default_heap_pages()
	}

	fn force_authoring(&self) -> Result<bool> {
		self.base.base.force_authoring()
	}

	fn disable_grandpa(&self) -> Result<bool> {
		self.base.base.disable_grandpa()
	}

	fn max_runtime_instances(&self) -> Result<Option<usize>> {
		self.base.base.max_runtime_instances()
	}

	fn announce_block(&self) -> Result<bool> {
		self.base.base.announce_block()
	}
}
