from flask import Flask, request, jsonify, send_from_directory
import os
import json
from typing import List, Dict, Any, Union
from datetime import datetime
from dotenv import load_dotenv
from flask_cors import CORS

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.llms import Tongyi

import logging
from logging.handlers import RotatingFileHandler

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
file_handler = RotatingFileHandler('moa_app.log', maxBytes=20480, backupCount=10)
file_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'))
logger.addHandler(file_handler)

# Load environment variables
load_dotenv()

CHAT_HISTORY_PATH = '../data/conversations.json'

# Configuration for models
T = 0.95
MODEL_CONFIGS = {
    "OpenAI": {
        "class": ChatOpenAI,
        "versions": ["gpt-3.5-turbo", "gpt-4"],
        "key": os.getenv("OPENAI_API_KEY"),
        "default_model": "gpt-3.5-turbo"
    },
    "Anthropic": {
        "class": ChatAnthropic,
        "versions": ["claude-2", "claude-instant-1"],
        "key": os.getenv("ANTHROPIC_API_KEY"),
        "default_model": "claude-1.3"
    },
    "Google": {
        "class": ChatGoogleGenerativeAI,
        "versions": ["gemini-pro", "gemini-1.5-flash", "gemini-1.5-pro"],
        "key": os.getenv('GOOGLE_API_KEY'),
        "default_model": "models/gemini-pro"
    },
    "Tongyi": {
        "class": Tongyi,
        "versions": ["Qwen-1_8B-Chat"],
        "key": os.getenv("DASHSCOPE_API_KEY"),
        "default_model": "Qwen-1_8B-Chat"
    }
}

MODEL_CHOICES = [f"{provider} {model}" for provider, config in MODEL_CONFIGS.items() for model in config["versions"]]

app = Flask(__name__)
CORS(app)

@app.route('/')
def serve_frontend():
    return send_from_directory('../front-end', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../front-end', path)

def get_llm(provider: str, model: str, temperature: float, max_tokens: int):
    config = MODEL_CONFIGS.get(provider)
    if not config:
        raise ValueError(f"Unknown provider: {provider}")

    if provider == "Google":
        return config["class"](model=model, api_key=config["key"], temperature=temperature, max_tokens=max_tokens, developer_instructions=True)

    return config["class"](model=model, api_key=config["key"], temperature=temperature, max_tokens=max_tokens)

def propose(llm: Union[BaseChatModel, Tongyi], prompt: str, references: List[str], provider: str) -> str:
    context = """As a responsible proposer, provide concise, accurate, factual, and well-supported information. Distinguish facts from opinions, acknowledge uncertainties, consider ethics, avoid bias, and provide sources when possible. Your input will be used for important decisions."""
    messages = [
        SystemMessage(content=context) if context else None,
        HumanMessage(content=prompt)
    ]
    messages = [m for m in messages if m is not None]

    try:
        if isinstance(llm, Tongyi):
            response = llm.generate(prompts=[prompt]).generations[0][0].text
        elif isinstance(llm, BaseChatModel):
            response = llm.invoke(messages).content
        else:
            raise TypeError(f"Unsupported client type for provider {provider}")

        return response
    except Exception as e:
        logger.error(f"Error generating response from {provider}: {str(e)}")
        return f"Error: {str(e)}"

def aggregate(llm: Union[BaseChatModel, Tongyi], original_prompt: str, custom_prompt: str, proposals: List[str], provider: str) -> str:
    context = f"query:\n{original_prompt}\n\ninformation:\n" + "\n".join(f"{i+1}. {prop}" for i, prop in enumerate(proposals))
    system_message = """As a responsible logician and debater, critically evaluate input, resolve contradictions, synthesize comprehensive answers, distinguish facts from opinions, acknowledge limitations, consider ethics, avoid bias, provide reasoning and sources, and ensure clarity and conciseness. Your synthesis will be used for important decision-making."""
    messages = [
        SystemMessage(content=system_message),
        HumanMessage(content=f"{context}\n\nBased on the above information and guidelines, provide a responsible and comprehensive answer to the original query.")
    ]



    logger.info(f"Aggregating with {provider}. Context: {context[:100]}...")
    try:
        if isinstance(llm, Tongyi):
            response = llm.generate(prompts=[messages[-1].content]).generations[0][0].text
        elif isinstance(llm, BaseChatModel):
            response = llm.invoke(messages).content
        else:
            raise TypeError(f"Unsupported client type for provider {provider}")

        logger.info(f"Aggregation result: {response[:100]}...")
        return response
    except Exception as e:
        logger.error(f"Error generating aggregated response from {provider}: {str(e)}")
        return f"Error: {str(e)}"

def save_conversation(prompt, proposals, aggregated_response):
    conversation = {
        "timestamp": datetime.now().isoformat(),
        "prompt": prompt,
        "proposals": proposals,
        "aggregated_response": aggregated_response
    }
    
    try:
        # Ensure the data directory exists
        os.makedirs(os.path.dirname(CHAT_HISTORY_PATH), exist_ok=True)
        
        # Read existing data or create an empty list
        if os.path.exists(CHAT_HISTORY_PATH):
            with open(CHAT_HISTORY_PATH, 'r') as file:
                data = json.load(file)
        else:
            data = []
        
        # Append new conversation and write back to file
        data.append(conversation)
        with open(CHAT_HISTORY_PATH, 'w') as file:
            json.dump(data, file, indent=2)
        
        logger.info(f"Conversation saved: {conversation['timestamp']}")
    except Exception as e:
        logger.error(f"Error saving conversation: {str(e)}")

def moa_process(initial_prompt: str,
                selected_models: List[Dict[str, str]],
                aggregator_config: Dict[str, str],
                aggregator_prompt: str,
                rounds: int = 1,
                temperature: float = 0.7,
                max_tokens: int = 2048) -> Dict[str, Any]:
    logger.info(f"Starting MoA process with prompt: {initial_prompt}")
    logger.info(f"Selected models: {selected_models}")
    logger.info(f"Aggregator config: {aggregator_config}")

    all_proposals = {}
    final_references = []

    for i_round in range(rounds):
        logger.info(f"Round {i_round+1}/{rounds} collecting reference responses.")

        round_proposals = {}
        round_references = []

        for model_config in selected_models:
            provider = model_config['provider']
            model = model_config['model']
            logger.info(f"Querying {provider}:{model}")
            try:
                llm = get_llm(provider, model, temperature, max_tokens)
                proposal = propose(llm, initial_prompt, final_references, provider)
                if isinstance(proposal, AIMessage):
                    proposal = proposal.content
                round_references.append(proposal)
                round_proposals[f"{provider}:{model}"] = proposal
                logger.info(f"Proposal from {provider}:{model} (Round {i_round+1}): {proposal[:100]}...")
            except Exception as e:
                logger.error(f"Error with {provider}:{model}: {str(e)}")
                round_proposals[f"{provider}:{model}"] = f"Error: {str(e)}"

        all_proposals[f"Round {i_round+1}"] = round_proposals

        if i_round < rounds - 1:
            final_references = round_references
        else:
            final_references.extend(round_references)

    aggregator_provider = aggregator_config['provider']
    aggregator_model = aggregator_config['model']
    logger.info(f"Aggregating with {aggregator_provider}:{aggregator_model}")
    try:
        aggregator_llm = get_llm(aggregator_provider, aggregator_model, temperature, max_tokens)
        aggregation = aggregate(aggregator_llm, initial_prompt, aggregator_prompt, final_references, aggregator_provider)
        if isinstance(aggregation, AIMessage):
            aggregation = aggregation.content
        logger.info(f"Aggregation result: {aggregation[:100]}...")
    except Exception as e:
        logger.error(f"Error with aggregator {aggregator_provider}:{aggregator_model}: {str(e)}")
        aggregation = f"Error in aggregation: {str(e)}"

    result = {
        "Initial Prompt": initial_prompt,
        "Proposals": all_proposals,
        "Aggregator Model": f"{aggregator_provider}:{aggregator_model}",
        "Aggregator Prompt": aggregator_prompt,
        "Aggregation": aggregation,
        "Rounds": rounds,
    }

    logger.info("MoA process completed")
    return result
 
@app.route('/models', methods=['GET'])
def get_models():
    logger.info("Received request for models")
    return jsonify(MODEL_CHOICES)

@app.route('/moa', methods=['POST'])
def moa():
    data = request.json
    logger.info(f"Received MoA request: {data}")

    prompt = data.get('prompt')
    selected_models = data.get('selectedModels')
    aggregator_config = data.get('aggregatorConfig')
    custom_prompt = data.get('customPrompt', "")
    rounds = data.get('rounds', 1)
    temperature = data.get('temperature', 0.7)
    max_tokens = data.get('maxTokens', 2048)

    result = moa_process(prompt, selected_models, aggregator_config, custom_prompt, rounds, temperature, max_tokens)

    proposals = result['Proposals']
    proposal_outputs = {f"{provider_model}": proposals[round][provider_model] for round in proposals for provider_model in proposals[round]}
    aggregated_output = result['Aggregation']

    # Save the conversation
    save_conversation(prompt, proposal_outputs, aggregated_output)

    response = {
        'proposals': proposal_outputs,
        'aggregatedResponse': aggregated_output
    }
    logger.info(f"Sending MoA response: {response}")
    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True)
